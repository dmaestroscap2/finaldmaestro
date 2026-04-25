type ClassroomLike = {
  id?: number | null;
  name?: string | null;
};

type MusicLike = {
  id?: number | null;
  title?: string | null;
  artist?: string | null;
};

export function buildClassroomAssignmentOptions(classrooms: ClassroomLike[]) {
  return classrooms
    .filter((classroom) => Number.isFinite(classroom.id) && String(classroom.name ?? "").trim().length > 0)
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((classroom) => ({
      value: String(classroom.id),
      label: String(classroom.name).trim(),
    }));
}

export function buildMusicAssignmentOptions(musicSheets: MusicLike[]) {
  return musicSheets
    .filter((music) => Number.isFinite(music.id) && String(music.title ?? "").trim().length > 0)
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((music) => ({
      value: String(music.id),
      label: `${String(music.title).trim()} - ${String(music.artist ?? "Unknown").trim()}`,
    }));
}
