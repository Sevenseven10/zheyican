export function confirmDelete(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return Promise.resolve(window.confirm('删除这一餐？\n\n删除后，这一餐的照片和文字记录都会从本机移除，无法撤销。'));
}
