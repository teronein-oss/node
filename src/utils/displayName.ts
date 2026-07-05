export function displayName(name?: string | null) {
  if (!name) return ''
  return name === '다태고' ? '고승환' : name
}
