from __future__ import annotations

import hashlib
import csv
import json
import re
import secrets
import unicodedata
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean
from xml.etree import ElementTree as ET

from pypdf import PdfReader


SOURCE_ROOT = Path("private")
OUTPUT_PATH = Path("functions/src/generatedExamPortalSeed.ts")
CODE_NOTE_PATH = Path("private/teacher-test-codes.md")
STUDENT_CODE_MAP_PATH = Path("private/student-access-code-map.json")
STUDENT_CODE_CSV_PATH = Path("private/student-access-codes.csv")
TEACHER_CONFIG_PATH = Path("private/teacher-access-codes.json")

TERM_ID = "2026-1-final"
YEAR = 2026
SEMESTER = 1
EXAM_TYPE = "기말고사"

ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ACCESS_CODE_LENGTH = 8

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def normalize_text(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def teacher_code_hash(code: str) -> str:
    return hashlib.sha256(f"teacher-report:{code}".encode()).hexdigest()


def student_code_hash(code: str) -> str:
    return hashlib.sha256(f"student-report:{code}".encode()).hexdigest()


def load_teacher_config() -> dict[str, dict[str, str]]:
    if not TEACHER_CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"{TEACHER_CONFIG_PATH} 파일이 필요합니다. "
            '{"백현고2": {"label": "A 선생님", "code": "8자리코드"}} 형식으로 작성하세요.'
        )
    data = json.loads(TEACHER_CONFIG_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not data:
        raise ValueError("교사 코드 설정 파일 형식이 올바르지 않습니다.")
    for school, teacher in data.items():
        if not isinstance(teacher, dict) or not teacher.get("label") or not teacher.get("code"):
            raise ValueError(f"{school} 교사 설정에 label과 code가 필요합니다.")
    return data


TEACHERS = load_teacher_config()


def create_access_code(used: set[str]) -> str:
    while True:
        code = "".join(secrets.choice(ACCESS_CODE_ALPHABET) for _ in range(ACCESS_CODE_LENGTH))
        if code not in used:
            used.add(code)
            return code


def load_student_codes() -> dict[str, dict[str, str]]:
    if not STUDENT_CODE_MAP_PATH.exists():
        return {}
    data = json.loads(STUDENT_CODE_MAP_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("학생 코드 매핑 파일 형식이 올바르지 않습니다.")
    return data


def student_key(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    return hashlib.sha256(f"exam-student:{digits}".encode()).hexdigest()[:20]


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")) for item in root]


def sheet_paths(archive: zipfile.ZipFile) -> list[str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheets = workbook.find(f"{{{MAIN_NS}}}sheets")
    if sheets is None or len(sheets) == 0:
        raise ValueError("시트를 찾을 수 없습니다.")
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        rel.attrib.get("Id"): rel.attrib["Target"]
        for rel in relationships.findall(f"{{{PKG_REL_NS}}}Relationship")
    }
    paths: list[str] = []
    for sheet in sheets:
        target = targets[sheet.attrib[f"{{{REL_NS}}}id"]]
        paths.append(target.lstrip("/") if target.startswith("/") else f"xl/{target}".replace("xl/xl/", "xl/"))
    return paths


def cell_value(cell: ET.Element, shared_strings: list[str]) -> object:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(f"{{{MAIN_NS}}}t"))
    value_node = cell.find(f"{{{MAIN_NS}}}v")
    if value_node is None or value_node.text is None:
        return ""
    raw = value_node.text
    if cell_type == "s":
        return shared_strings[int(raw)]
    if cell_type in {"str", "e"}:
        return raw
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def column_number(reference: str) -> int:
    letters = re.match(r"([A-Z]+)", reference)
    if not letters:
        return 0
    number = 0
    for character in letters.group(1):
        number = number * 26 + ord(character) - ord("A") + 1
    return number


def read_score_rows(path: Path, objective_count: int) -> list[dict[str, object]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings = read_shared_strings(archive)
        sheets = [ET.fromstring(archive.read(sheet_path)) for sheet_path in sheet_paths(archive)]

    def parse_sheet(sheet: ET.Element) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        for row in sheet.iter(f"{{{MAIN_NS}}}row"):
            row_number = int(row.attrib.get("r", "0"))
            if row_number < 3:
                continue
            values: dict[int, object] = {}
            for cell in row.findall(f"{{{MAIN_NS}}}c"):
                reference = cell.attrib.get("r", "")
                column = column_number(reference)
                if 2 <= column <= 57 + objective_count:
                    values[column] = cell_value(cell, shared_strings)

            name = normalize_text(str(values.get(3, "")).strip())
            phone = str(values.get(2, "")).strip()
            if not name or not phone:
                continue
            try:
                rows.append({
                    "studentId": student_key(phone),
                    "studentName": name,
                    "sourceRank": int(float(values.get(4, 0))),
                    "totalScore": float(values.get(5, 0)),
                    "writtenScore": float(values.get(6, 0)),
                    "objectiveScore": float(values.get(7, 0)),
                    "questionResults": [
                        str(values.get(57 + question, "")).strip().upper() == "O"
                        for question in range(1, objective_count + 1)
                    ],
                })
            except (TypeError, ValueError) as error:
                raise ValueError(f"{path}: {row_number}행 점수 형식을 읽을 수 없습니다.") from error
        return rows

    rows = parse_sheet(sheets[0])
    if objective_count == 20:
        mismatches = sum(
            float(row["objectiveScore"]) != sum(row["questionResults"]) * 4
            for row in rows
        )
        if mismatches > len(rows) / 2 and len(sheets) > 1:
            alternate = {row["studentId"]: row["questionResults"] for row in parse_sheet(sheets[1])}
            for row in rows:
                if row["studentId"] in alternate:
                    row["questionResults"] = alternate[row["studentId"]]

    if not rows:
        raise ValueError(f"{path}: 학생 점수 행이 없습니다.")
    return rows


def school_metadata(folder_name: str) -> tuple[str, int]:
    normalized = normalize_text(folder_name)
    match = re.fullmatch(r"(.+고)(\d)", normalized)
    if not match:
        raise ValueError(f"학교 폴더명에서 학년을 확인할 수 없습니다: {normalized}")
    return match.group(1), int(match.group(2))


def round_number(folder_name: str) -> int:
    match = re.search(r"(\d+)", normalize_text(folder_name))
    if not match:
        raise ValueError(f"회차 폴더명을 확인할 수 없습니다: {folder_name}")
    return int(match.group(1))


def classify_question(prompt: str) -> tuple[str, str] | None:
    compact = re.sub(r"\s+", " ", prompt)
    if "전체 흐름과 관계 없는" in compact:
        return "글의 구조", "무관한 문장"
    if "주어진 문장이 들어가기에" in compact:
        return "글의 구조", "문장 삽입"
    if "이어질 글의 순서" in compact or "순서에 맞게 배열" in compact:
        return "글의 구조", "글의 순서"
    if "한 문장으로 요약" in compact:
        return "요약·통합", "요약문 완성"
    if "가리키는 대상" in compact:
        return "세부 내용", "지칭 추론"
    if "의미하는 바로" in compact:
        return "추론·의미", "함의 추론"
    if "문맥상 낱말" in compact:
        return "어법·어휘", "문맥 어휘"
    if "밑줄 친 부분 중 적절한 것을 고른" in compact:
        return "어법·어휘", "어법·어휘 선택"
    if "어법" in compact or "각 네모 안" in compact or "각 괄호 안" in compact:
        return "어법·어휘", "어법"
    if "내용과 일치하지" in compact or "내용으로 적절하지" in compact or "내용에 관한 내용으로 적절하지" in compact or "관한 내용으로 적절하지" in compact:
        return "세부 내용", "내용 불일치"
    if "내용과 일치하는" in compact or "내용으로 적절한" in compact or "내용으로 가장 적절한" in compact or "내용에 관한 내용으로 가장 적절한" in compact:
        return "세부 내용", "내용 일치"
    if "빈칸" in compact:
        return "추론·의미", "빈칸 추론"
    if "제목" in compact:
        return "대의 파악", "제목"
    if "주제" in compact:
        return "대의 파악", "주제"
    return None


def extract_question_types(path: Path, objective_count: int) -> list[dict[str, object]]:
    reader = PdfReader(path)
    text = " ".join((page.extract_text() or "").replace("\n", " ") for page in reader.pages)
    question_types: list[dict[str, object]] = []
    missing: list[int] = []
    for question in range(1, objective_count + 1):
        candidates: list[str] = []
        for match in re.finditer(rf"(?<!\d){question}[.)]\s*", text):
            candidate = re.sub(r"\s+", " ", text[match.end():match.end() + 260])
            if candidate:
                candidates.append(candidate)
        classified = next(
            ((category, detail_type) for candidate in candidates if (result := classify_question(candidate)) for category, detail_type in [result]),
            None,
        )
        if not classified:
            missing.append(question)
            continue
        category, detail_type = classified
        question_types.append({"number": question, "category": category, "detailType": detail_type})
    if missing:
        raise ValueError(f"{path}: 유형을 분류하지 못한 객관식 문항 {missing}")
    return question_types


def build_exam(school_id: str, school: str, grade: int, round_dir: Path, workbook: Path, exam_pdf: Path, objective_count: int) -> dict[str, object]:
    question_types = extract_question_types(exam_pdf, objective_count)
    rows = read_score_rows(workbook, objective_count)
    totals = [float(row["totalScore"]) for row in rows]
    round_value = round_number(round_dir.name)

    students: list[dict[str, object]] = []
    for row in rows:
        total_score = float(row["totalScore"])
        rank = 1 + sum(other > total_score for other in totals)
        type_results: dict[str, dict[str, object]] = {}
        for question in question_types:
            detail_type = str(question["detailType"])
            stat = type_results.setdefault(detail_type, {
                "category": question["category"],
                "detailType": detail_type,
                "correct": 0,
                "total": 0,
                "missedQuestions": [],
            })
            stat["total"] = int(stat["total"]) + 1
            question_number = int(question["number"])
            if row["questionResults"][question_number - 1]:
                stat["correct"] = int(stat["correct"]) + 1
            else:
                stat["missedQuestions"].append(question_number)
        students.append({
            "studentId": row["studentId"],
            "studentName": row["studentName"],
            "totalScore": total_score,
            "objectiveScore": float(row["objectiveScore"]),
            "writtenScore": float(row["writtenScore"]),
            "rank": rank,
            "topPercent": max(1, min(100, -(-rank * 100 // len(rows)))),
            "typeResults": list(type_results.values()),
        })

    students.sort(key=lambda student: (int(student["rank"]), str(student["studentName"])))
    return {
        "examId": f"{TERM_ID}-{school_id}-r{round_value}",
        "termId": TERM_ID,
        "round": round_value,
        "title": f"{school}{grade} {YEAR}학년도 {SEMESTER}학기 {EXAM_TYPE} 대비 {round_value}차",
        "averages": {
            "total": round(mean(float(row["totalScore"]) for row in rows), 1),
            "objective": round(mean(float(row["objectiveScore"]) for row in rows), 1),
            "written": round(mean(float(row["writtenScore"]) for row in rows), 1),
        },
        "questionTypes": question_types,
        "students": students,
    }


def main() -> None:
    cohorts: list[dict[str, object]] = []
    matched_folders: set[str] = set()
    student_codes = load_student_codes()
    used_codes = {code for cohort_codes in student_codes.values() for code in cohort_codes.values()}
    code_csv_rows: list[list[object]] = []

    for school_dir in sorted(path for path in SOURCE_ROOT.iterdir() if path.is_dir()):
        normalized_folder = normalize_text(school_dir.name)
        teacher = TEACHERS.get(normalized_folder)
        if not teacher:
            continue
        matched_folders.add(normalized_folder)
        school, grade = school_metadata(school_dir.name)
        school_id = "baekhyeon-2" if normalized_folder == "백현고2" else "cheongdeok-2"
        exams: list[dict[str, object]] = []

        for round_dir in sorted(path for path in school_dir.iterdir() if path.is_dir()):
            workbooks = sorted(round_dir.glob("*.xlsx"))
            exam_pdfs = sorted(round_dir.glob("*.pdf"))
            if len(workbooks) != 1:
                raise ValueError(f"{round_dir}: 채점 결과 Excel이 정확히 1개여야 합니다.")
            if len(exam_pdfs) != 1:
                raise ValueError(f"{round_dir}: 시험지 PDF가 정확히 1개여야 합니다.")
            objective_count = 20 if normalized_folder == "백현고2" else 28
            exams.append(build_exam(school_id, school, grade, round_dir, workbooks[0], exam_pdfs[0], objective_count))

        exams.sort(key=lambda exam: int(exam["round"]))
        students: dict[str, str] = {}
        for exam in exams:
            for student in exam["students"]:
                students[str(student["studentId"])] = str(student["studentName"])
        cohort_codes = student_codes.setdefault(school_id, {})
        student_access: list[dict[str, str]] = []
        for student_id, student_name in sorted(students.items(), key=lambda item: item[1]):
            code = cohort_codes.get(student_id)
            if not code:
                code = create_access_code(used_codes)
                cohort_codes[student_id] = code
            if len(code) != ACCESS_CODE_LENGTH or any(character not in ACCESS_CODE_ALPHABET for character in code):
                raise ValueError(f"{student_name} 학생 코드 형식이 올바르지 않습니다.")
            student_access.append({
                "studentId": student_id,
                "studentName": student_name,
                "accessHash": student_code_hash(code),
            })
            code_csv_rows.append([school, grade, student_name, f"{code[:4]}-{code[4:]}"])
        cohorts.append({
            "cohortId": school_id,
            "school": school,
            "grade": grade,
            "teacherLabel": teacher["label"],
            "teacherAccessHash": teacher_code_hash(str(teacher["code"])),
            "studentAccess": student_access,
            "exams": exams,
        })

    missing = set(TEACHERS) - matched_folders
    if missing:
        raise ValueError(f"학교 폴더를 찾을 수 없습니다: {', '.join(sorted(missing))}")

    generated_at = datetime.now(timezone.utc)
    payload = {
        "generatedAt": int(generated_at.timestamp() * 1000),
        "expiresAt": int((generated_at + timedelta(days=730)).timestamp() * 1000),
        "terms": [{
            "termId": TERM_ID,
            "year": YEAR,
            "semester": SEMESTER,
            "examType": EXAM_TYPE,
            "label": f"{YEAR}학년도 {SEMESTER}학기 {EXAM_TYPE}",
        }],
        "cohorts": cohorts,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        "// private 시험 채점표에서 자동 생성됩니다. 원본 파일과 이 파일은 Git에 포함하지 않습니다.\n"
        f"export const examPortalSeed = {json.dumps(payload, ensure_ascii=False, indent=2)} as const\n",
        encoding="utf-8",
    )
    CODE_NOTE_PATH.write_text(
        "# 교사용 테스트 접근 코드\n\n"
        f"- A 선생님 · 백현고2: `{TEACHERS['백현고2']['code'][:4]}-{TEACHERS['백현고2']['code'][4:]}`\n"
        f"- B 선생님 · 청덕고2: `{TEACHERS['청덕고2']['code'][:4]}-{TEACHERS['청덕고2']['code'][4:]}`\n\n"
        "테스트가 끝나면 코드를 교체하거나 비활성화하세요.\n",
        encoding="utf-8",
    )
    STUDENT_CODE_MAP_PATH.write_text(
        json.dumps(student_codes, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    with STUDENT_CODE_CSV_PATH.open("w", encoding="utf-8-sig", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["학교", "학년", "학생", "학생 식별 코드"])
        writer.writerows(code_csv_rows)

    for cohort in cohorts:
        exam_counts = ", ".join(f"{exam['round']}차 {len(exam['students'])}명" for exam in cohort["exams"])
        print(f"{cohort['school']}{cohort['grade']}: {exam_counts}")


if __name__ == "__main__":
    main()
