// נוסיף קובץ עזר לטיפול ברמות קושי
export const difficultyDisplay = {
  EASY: "קל",
  MEDIUM: "בינוני",
  HARD: "מורכב",
} as const;

export const difficultyVariants = {
  EASY: "success",
  MEDIUM: "default",
  HARD: "error",
} as const;

export const difficultyOptions = [
  { value: "EASY", label: "קל" },
  { value: "MEDIUM", label: "בינוני" },
  { value: "HARD", label: "מורכב" },
] as const; 