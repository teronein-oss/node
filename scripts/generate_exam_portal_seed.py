"""Generate a private SEUM report seed and access codes from a reviewed manifest.

Source PDF/XLSX, generated student data, and plain access codes stay under
private/ or in the Git-ignored Functions seed. Run from the repository root.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import secrets
import unicodedata
from zipfile import ZipFile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean

from openpyxl import load_workbook
from openpyxl.utils.cell import column_index_from_string
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "functions/src/generatedExamPortalSeed.ts"
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def clean(value: object) -> str:
    return unicodedata.normalize("NFC", str(value if value is not None else "")).strip()


def private_path(value: str) -> Path:
    path = (ROOT / value).resolve()
    if not path.is_relative_to(ROOT / "private") or not path.is_file():
        raise ValueError(f"원본 파일이 private/에 없습니다: {value}")
    return path


def write_private(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as stream:
        stream.write(content)
    os.replace(temporary, path)
    os.chmod(path, 0o600)


def code_hash(kind: str, code: str) -> str:
    return hashlib.sha256(f"{kind}-report:{code}".encode()).hexdigest()


def name_only_student_id(cohort_id: str, name: str) -> str:
    return hashlib.sha256(f"seum-student-nameonly:{cohort_id}:{name}".encode()).hexdigest()[:20]


def new_code(length: int, used: set[str]) -> str:
    while True:
        candidate = "".join(secrets.choice(ALPHABET) for _ in range(length))
        if candidate not in used:
            used.add(candidate)
            return candidate


def valid_code(value: object, length: int) -> bool:
    return isinstance(value, str) and len(value) == length and all(char in ALPHABET for char in value)


def read_map(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if not isinstance(data, dict):
        raise ValueError(f"코드 파일 형식이 올바르지 않습니다: {path}")
    return data


def number(value: object, where: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{where}: 숫자 점수가 없습니다.")
    result = float(value)
    if result < 0 or result > 100:
        raise ValueError(f"{where}: 점수가 0~100 범위를 벗어났습니다.")
    return result


def open_score_workbook(path: Path):
    """Read source files whose default Excel style omits its required name."""
    with ZipFile(path) as source:
        style = source.read("xl/styles.xml")
        malformed = b'<x:cellStyle xfId="0" builtinId="0"'
        if malformed not in style:
            return load_workbook(path, read_only=True, data_only=True)
        repaired = io.BytesIO()
        with ZipFile(repaired, "w") as output:
            for entry in source.infolist():
                data = source.read(entry.filename)
                if entry.filename == "xl/styles.xml":
                    data = data.replace(malformed, b'<x:cellStyle name="Normal" xfId="0" builtinId="0"')
                output.writestr(entry, data)
    repaired.seek(0)
    return load_workbook(repaired, read_only=True, data_only=True)


def validate_questions(exam: dict) -> list[dict]:
    pdf = private_path(exam["pdf"])
    if not PdfReader(pdf).pages:
        raise ValueError(f"시험지 PDF를 읽을 수 없습니다: {pdf}")
    if exam.get("solutionPdf") and not PdfReader(private_path(exam["solutionPdf"])).pages:
        raise ValueError("해설지 PDF를 읽을 수 없습니다.")
    questions = exam["questionTypes"]
    if [item["number"] for item in questions] != list(range(1, len(questions) + 1)):
        raise ValueError("객관식 문항 번호가 연속되지 않습니다.")
    for item in questions:
        if not all(clean(item.get(key)) for key in ("category", "detailType", "topic")):
            raise ValueError(f"{item['number']}번 문항 유형 또는 소재가 비어 있습니다.")
        if clean(item.get("correctAnswer")) not in {"1", "2", "3", "4", "5"}:
            raise ValueError(f"{item['number']}번 정답 번호를 확인해 주세요.")
        points = item.get("points", exam.get("objectivePointsEach"))
        if isinstance(points, bool) or not isinstance(points, (int, float)) or points <= 0:
            raise ValueError(f"{item['number']}번 배점을 확인해 주세요.")
    objective_max = sum(item.get("points", exam.get("objectivePointsEach")) for item in questions)
    written_max = exam.get("writtenMaxScore", 100 - objective_max)
    if not isinstance(written_max, (int, float)) or written_max < 0 or objective_max + written_max != 100:
        raise ValueError("시험지 객관식·서술형 배점 합계가 100점이 아닙니다.")
    return questions


def read_score_sheet(cohort_id: str, exam: dict, questions: list[dict]) -> tuple[list[dict], list[dict]]:
    score_policy = exam.get("scorePolicy", "workbook")
    if score_policy not in ("workbook", "examPoints"):
        raise ValueError("채점 기준은 workbook 또는 examPoints여야 합니다.")
    workbook = open_score_workbook(private_path(exam["workbook"]))
    try:
        sheet = workbook[exam["sheet"]]
        columns = {key: column_index_from_string(letter) for key, letter in exam["columns"].items()}
        students: list[dict] = []
        warnings: list[dict] = []
        seen: set[str] = set()
        manual_rows = exam.get("manualQuestionResultsByRow", {})
        manual_seen: set[str] = set()
        manual_student_ids: set[str] = set()
        for row_number in range(exam["firstStudentRow"], sheet.max_row + 1):
            values = [cell.value for cell in sheet[row_number]]

            def at(column: int) -> object:
                return values[column - 1] if column <= len(values) else None

            name, phone = clean(at(columns["name"])), clean(at(columns["phone"]))
            if not name and not phone:
                continue
            where = f"{sheet.title}!{row_number}"
            manual = manual_rows.get(str(row_number))
            if not name or (not phone and manual is None):
                raise ValueError(f"{where}: 이름 또는 학생 식별용 번호가 없습니다.")
            if manual is not None:
                if phone or not isinstance(manual, dict) or manual.get("studentNameHash") != hashlib.sha256(name.encode()).hexdigest()[:20]:
                    raise ValueError(f"{where}: 별도 제공 정오표의 학생 정보가 원본과 다릅니다.")
                student_id = name_only_student_id(cohort_id, name)
            else:
                digits = re.sub(r"\D", "", phone)
                if len(digits) < 4:
                    raise ValueError(f"{where}: 학생 식별용 번호 끝 4자리가 없습니다.")
                student_id = hashlib.sha256(f"seum-student:{cohort_id}:{digits}".encode()).hexdigest()[:20]
            if student_id in seen:
                raise ValueError(f"{where}: 학생 식별용 번호가 중복됩니다.")
            seen.add(student_id)
            total = number(at(columns["total"]), f"{where} 총점")
            objective = number(at(columns["objective"]), f"{where} 객관식")
            written = number(at(columns["written"]), f"{where} 서술형")
            answers: list[str] = []
            correct: list[bool] = []
            if manual is not None:
                marks = manual.get("results")
                if not isinstance(marks, str) or len(marks) != len(questions) or set(marks) - {"O", "X"}:
                    raise ValueError(f"{where}: 별도 제공 정오표 형식이 올바르지 않습니다.")
                if any(clean(at(columns["answersStart"] + offset)) or clean(at(columns["resultsStart"] + offset)) for offset in range(len(questions))):
                    raise ValueError(f"{where}: 원본 채점표에 문항 답안이 있어 별도 정오표 적용 여부를 재검토해야 합니다.")
                answers = [question["correctAnswer"] if marker == "O" else "?" for question, marker in zip(questions, marks)]
                correct = [marker == "O" for marker in marks]
                manual_seen.add(str(row_number))
                manual_student_ids.add(student_id)
                warnings.append({"cell": where, "issue": "별도 제공 정오표 반영·오답 선택지 미상"})
            else:
                for offset, question in enumerate(questions):
                    answer = clean(at(columns["answersStart"] + offset))
                    marker = clean(at(columns["resultsStart"] + offset)).upper()
                    if marker not in ("O", "X"):
                        raise ValueError(f"{where} {offset + 1}번: 정오표에 O/X가 없습니다.")
                    if (marker == "O") != (answer == question["correctAnswer"]):
                        if answer in {"1", "2", "3", "4", "5"}:
                            raise ValueError(f"{where} {offset + 1}번: 학생 답안·정답·정오표가 모순됩니다.")
                    if answer not in {"1", "2", "3", "4", "5"}:
                        if marker == "O":
                            raise ValueError(f"{where} {offset + 1}번: 유효하지 않은 답안에 정답 표시가 있습니다.")
                        warnings.append({"cell": where, "question": offset + 1, "issue": "답안 공란" if not answer else "선택지 범위 밖"})
                    answers.append(answer)
                    correct.append(marker == "O")
            expected_objective = sum(
                question.get("points", exam.get("objectivePointsEach"))
                for question, is_correct in zip(questions, correct) if is_correct
            )
            if abs(total - objective - written) > 0.001:
                raise ValueError(f"{where}: 엑셀 총점과 객관식·서술형 합계가 다릅니다.")
            if score_policy == "workbook" and abs(objective - expected_objective) > 0.001:
                raise ValueError(f"{where}: 객관식 점수가 시험지 배점·정오표와 다릅니다.")
            if score_policy == "examPoints" and abs(objective - expected_objective) > 0.001:
                warnings.append({
                    "cell": where, "issue": "시험지 배점으로 재산정",
                    "sourceTotal": total, "recalculatedTotal": expected_objective + written,
                    "sourceObjective": objective, "recalculatedObjective": expected_objective,
                })
            students.append({
                "studentId": student_id, "studentName": name,
                "totalScore": expected_objective + written if score_policy == "examPoints" else total,
                "objectiveScore": expected_objective if score_policy == "examPoints" else objective,
                "writtenScore": written,
                "sourceTotalScore": total, "sourceObjectiveScore": objective,
                "answers": answers, "questionResults": correct,
            })
        if not students:
            raise ValueError(f"{sheet.title}: 학생 채점 행이 없습니다.")
        if manual_seen != set(manual_rows):
            raise ValueError(f"{sheet.title}: 별도 정오표 학생이 원본 시트에 없습니다.")
        if exam.get("crossCheck"):
            comparison = exam["crossCheck"]
            alternate = workbook[comparison["sheet"]]
            alt_columns = {key: column_index_from_string(letter) for key, letter in comparison["columns"].items()}
            primary_by_id = {student["studentId"]: student for student in students}
            compared: set[str] = set()
            for row_number in range(exam["firstStudentRow"], alternate.max_row + 1):
                values = [cell.value for cell in alternate[row_number]]

                def other(key: str, offset: int = 0) -> object:
                    column = alt_columns[key] + offset
                    return values[column - 1] if column <= len(values) else None

                name, phone = clean(other("name")), clean(other("phone"))
                if not name and not phone:
                    continue
                where = f"{alternate.title}!{row_number}"
                if not phone:
                    student_id = name_only_student_id(cohort_id, name)
                    if student_id not in manual_student_ids:
                        raise ValueError(f"{where}: 보조 시트 학생의 식별 번호가 없습니다.")
                else:
                    digits = re.sub(r"\D", "", phone)
                    student_id = hashlib.sha256(f"seum-student:{cohort_id}:{digits}".encode()).hexdigest()[:20]
                primary = primary_by_id.get(student_id)
                if primary is None or student_id in compared or primary["studentName"] != name:
                    raise ValueError(f"{where}: 보조 시트의 학생이 원본 시트와 다릅니다.")
                compared.add(student_id)
                if number(other("objective"), f"{where} 객관식") != primary["sourceObjectiveScore"] or number(other("written"), f"{where} 서술형") != primary["writtenScore"]:
                    raise ValueError(f"{where}: 보조 시트의 세부 점수가 원본 시트와 다릅니다.")
                if student_id in manual_student_ids:
                    if any(clean(other("answersStart", offset)) or clean(other("resultsStart", offset)) for offset in range(len(questions))):
                        raise ValueError(f"{where}: 보조 시트에 별도 정오표 학생의 문항 답안이 있습니다.")
                else:
                    if [clean(other("answersStart", offset)) for offset in range(len(questions))] != primary["answers"]:
                        raise ValueError(f"{where}: 보조 시트의 객관식 답안이 원본 시트와 다릅니다.")
                    if [clean(other("resultsStart", offset)).upper() == "O" for offset in range(len(questions))] != primary["questionResults"]:
                        raise ValueError(f"{where}: 보조 시트의 정오표가 원본 시트와 다릅니다.")
                alt_total = number(other("total"), f"{where} 총점")
                if alt_total != primary["sourceTotalScore"]:
                    warnings.append({"cell": where, "issue": "보조 시트 총점 불일치", "sourceTotal": primary["totalScore"], "alternateTotal": alt_total})
            if compared != set(primary_by_id):
                raise ValueError(f"{alternate.title}: 보조 시트 학생 수가 원본 시트와 다릅니다.")
        return students, warnings
    finally:
        workbook.close()


def build_exam(cohort: dict, exam: dict) -> tuple[dict, list[dict]]:
    questions = validate_questions(exam)
    rows, warnings = read_score_sheet(cohort["cohortId"], exam, questions)
    totals = [row["totalScore"] for row in rows]
    students = []
    for row in rows:
        types: dict[tuple[str, str], dict] = {}
        for question in questions:
            index = question["number"] - 1
            key = (question["category"], question["detailType"])
            group = types.setdefault(key, {
                "category": key[0], "detailType": key[1],
                "correct": 0, "total": 0, "missedQuestions": [],
            })
            group["total"] += 1
            if row["questionResults"][index]:
                group["correct"] += 1
            else:
                group["missedQuestions"].append(index + 1)
        rank = 1 + sum(other > row["totalScore"] for other in totals)
        students.append({
            "studentId": row["studentId"], "studentName": row["studentName"],
            "totalScore": row["totalScore"], "objectiveScore": row["objectiveScore"],
            "writtenScore": row["writtenScore"], "rank": rank,
            "topPercent": max(1, min(100, -(-rank * 100 // len(rows)))),
            "answers": row["answers"], "questionResults": row["questionResults"],
            "typeResults": list(types.values()),
        })
    students.sort(key=lambda student: (student["rank"], student["studentName"]))
    subject = clean(exam.get("subject"))
    subject_slug = {"영어": "english", "국어": "korean"}.get(subject)
    if not subject_slug:
        raise ValueError(f"지원하지 않는 과목입니다: {subject}")
    objective_max = sum(item.get("points", exam.get("objectivePointsEach")) for item in questions)
    written_max = exam.get("writtenMaxScore", 100 - objective_max)
    return {
        "examId": f"{cohort['termId']}-{cohort['cohortId']}-{subject_slug}-r{exam['round']}",
        "termId": cohort["termId"], "subject": subject,
        "round": exam["round"], "title": exam["title"],
        "objectiveMaxScore": objective_max, "writtenMaxScore": written_max, "totalMaxScore": objective_max + written_max,
        "averages": {key: round(mean(row[f"{key}Score"] for row in rows), 1) for key in ("total", "objective", "written")},
        "questionTypes": questions, "students": students,
    }, warnings


def csv_text(rows: list[list[object]]) -> str:
    buffer = io.StringIO()
    csv.writer(buffer).writerows(rows)
    return "\ufeff" + buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="scripts/exam_portal_2026_2_midterm.json")
    parser.add_argument("--allow-warnings", action="store_true", help="Use only after the source grading issues have been reviewed")
    args = parser.parse_args()
    manifest = json.loads((ROOT / args.manifest).read_text(encoding="utf-8"))
    term_id = clean(manifest["termId"])
    output_dir = ROOT / "private/exam-imports" / term_id
    # A new term has its own code files. The previous term's codes are never reused.
    student_codes = read_map(output_dir / "student-access-code-map.json")
    teacher_codes = read_map(output_dir / "teacher-access-codes.json")
    subject_teacher_codes = read_map(output_dir / "subject-teacher-access-codes.json")
    if any(not isinstance(by_subject, dict) for by_subject in subject_teacher_codes.values()):
        raise ValueError("과목별 교사 코드 파일 형식이 올바르지 않습니다.")
    existing_codes = [code for school in student_codes.values() for code in school.values()]
    existing_codes.extend(entry["code"] for entry in teacher_codes.values())
    existing_codes.extend(entry["code"] for school in subject_teacher_codes.values() for entry in school.values())
    if len(existing_codes) != len(set(existing_codes)):
        raise ValueError("저장된 학생·교사 코드에 중복이 있습니다. 코드 맵을 확인해 주세요.")
    used = set(existing_codes)
    cohorts, warnings = [], []
    student_csv: list[list[object]] = [["학교", "학년", "학생", "학생 식별 코드"]]
    teacher_csv: list[list[object]] = [["학교", "학년", "담당", "교사용 마스터 코드"]]
    subject_teacher_csv: list[list[object]] = [["학교", "학년", "과목", "담당", "과목 전용 마스터 코드"]]
    for school in manifest["cohorts"]:
        cohort = {**school, "termId": term_id}
        exams = []
        if school.get("sourceTermNote"):
            warnings.append({"school": school["school"], "issue": "시험지 학기 표기 확인", "note": school["sourceTermNote"]})
        for exam_manifest in school["exams"]:
            exam, issues = build_exam(cohort, exam_manifest)
            exams.append(exam)
            warnings.extend({"school": school["school"], "round": exam_manifest["round"], **item} for item in issues)
        if len({(exam["subject"], exam["round"]) for exam in exams}) != len(exams):
            raise ValueError("같은 과목의 회차 번호가 중복됩니다.")
        exams.sort(key=lambda exam: (exam["subject"], exam["round"]))
        students: dict[str, str] = {}
        for exam in exams:
            for student in exam["students"]:
                previous = students.setdefault(student["studentId"], student["studentName"])
                if previous != student["studentName"]:
                    raise ValueError("같은 학생 식별 번호의 이름이 과목별 채점표에서 다릅니다.")
        school_codes = student_codes.setdefault(school["cohortId"], {})
        access = []
        for student_id, name in sorted(students.items(), key=lambda item: item[1]):
            code = school_codes.get(student_id) or new_code(8, used)
            if not valid_code(code, 8):
                raise ValueError("학생 코드 형식이 올바르지 않습니다.")
            school_codes[student_id] = code
            access.append({"studentId": student_id, "studentName": name, "accessHash": code_hash("student", code)})
            student_csv.append([school["school"], school["grade"], name, f"{code[:4]}-{code[4:]}"])
        teacher = teacher_codes.get(school["cohortId"])
        if teacher is None:
            teacher = {"label": school["teacherLabel"], "code": new_code(12, used)}
            teacher_codes[school["cohortId"]] = teacher
        if not valid_code(teacher.get("code"), 12):
            raise ValueError("교사용 마스터 코드 형식이 올바르지 않습니다.")
        code = teacher["code"]
        teacher_csv.append([school["school"], school["grade"], teacher["label"], f"{code[:4]}-{code[4:8]}-{code[8:]}"])
        school_subject_codes = subject_teacher_codes.setdefault(school["cohortId"], {})
        subject_teacher_access = []
        seen_subjects: set[str] = set()
        for subject_teacher in school.get("subjectTeachers", []):
            subject = clean(subject_teacher.get("subject"))
            label = clean(subject_teacher.get("label"))
            if not label or subject not in {exam["subject"] for exam in exams} or subject in seen_subjects:
                raise ValueError("과목별 교사 설정의 과목·담당 이름이 잘못되었거나 중복됩니다.")
            seen_subjects.add(subject)
            entry = school_subject_codes.get(subject)
            if entry is None:
                entry = {"label": label, "code": new_code(12, used)}
                school_subject_codes[subject] = entry
            if not valid_code(entry.get("code"), 12):
                raise ValueError("과목별 교사 코드 형식이 올바르지 않습니다.")
            entry["label"] = label
            subject_code = entry["code"]
            subject_teacher_access.append({
                "subject": subject, "label": label,
                "accessHash": code_hash("teacher", subject_code),
            })
            subject_teacher_csv.append([
                school["school"], school["grade"], subject, label,
                f"{subject_code[:4]}-{subject_code[4:8]}-{subject_code[8:]}",
            ])
        cohorts.append({
            "cohortId": school["cohortId"], "school": school["school"], "grade": school["grade"],
            "teacherLabel": teacher["label"], "teacherAccessHash": code_hash("teacher", code),
            "subjectTeacherAccess": subject_teacher_access,
            "studentAccess": access, "exams": exams,
        })
    if not cohorts:
        raise ValueError("학교가 없습니다.")
    write_private(output_dir / "import-audit.json", json.dumps({"termId": term_id, "warnings": warnings}, ensure_ascii=False, indent=2) + "\n")
    blocking = [item for item in warnings if item["issue"] == "총점 불일치"]
    if blocking and not args.allow_warnings:
        raise ValueError(f"원본 채점표에 총점 불일치 {len(blocking)}건이 있습니다. import-audit.json을 확인해 주세요.")
    now = datetime.now(timezone.utc)
    payload = {
        "generatedAt": int(now.timestamp() * 1000),
        "expiresAt": int((now + timedelta(days=730)).timestamp() * 1000),
        "terms": [{
            "termId": term_id, "year": manifest["year"], "semester": manifest["semester"],
            "examType": manifest["examType"],
            "label": f"{manifest['year']}학년도 {manifest['semester']}학기 {manifest['examType']}",
        }],
        "cohorts": cohorts,
    }
    write_private(SEED, "// private 채점표에서 생성되었습니다. Git에 포함하지 않습니다.\n"
                  + f"export const examPortalSeed = {json.dumps(payload, ensure_ascii=False, indent=2)} as const\n")
    write_private(output_dir / "student-access-code-map.json", json.dumps(student_codes, ensure_ascii=False, indent=2) + "\n")
    write_private(output_dir / "teacher-access-codes.json", json.dumps(teacher_codes, ensure_ascii=False, indent=2) + "\n")
    write_private(output_dir / "subject-teacher-access-codes.json", json.dumps(subject_teacher_codes, ensure_ascii=False, indent=2) + "\n")
    write_private(output_dir / "student-access-codes.csv", csv_text(student_csv))
    write_private(output_dir / "teacher-master-codes.csv", csv_text(teacher_csv))
    write_private(output_dir / "subject-teacher-master-codes.csv", csv_text(subject_teacher_csv))
    notion_lines = [f"# {manifest['year']}학년도 {manifest['semester']}학기 {manifest['examType']} 학생 확인 코드", ""]
    for cohort in cohorts:
        notion_lines.extend([
            f"## {cohort['school']} {cohort['grade']}학년", "",
            "| 학생 | 개인 확인 코드 |", "| --- | --- |",
        ])
        for row in student_csv[1:]:
            if row[0] == cohort["school"] and row[1] == cohort["grade"]:
                notion_lines.append(f"| {row[2]} | {row[3]} |")
        notion_lines.append("")
    write_private(output_dir / "notion-student-codes.md", "\n".join(notion_lines))
    print(f"생성 완료: {sum(len(cohort['studentAccess']) for cohort in cohorts)}명, {len(cohorts)}개 학교, 검토 항목 {len(warnings)}건")
    print(f"학생 코드: {output_dir / 'student-access-codes.csv'}")
    print(f"교사 코드: {output_dir / 'teacher-master-codes.csv'}")
    print(f"과목별 교사 코드: {output_dir / 'subject-teacher-master-codes.csv'}")


if __name__ == "__main__":
    main()
