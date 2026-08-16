import type { ShellBackground } from './shellBackground';

const colors: Record<ShellBackground, string> = {
  light: '#F3F2ED',
  dark: '#262725',
  composer: '#171816',
  camera: '#000000',
};

export function setShellBackground(background: ShellBackground) {
  if (typeof document === 'undefined') return;
  const color = colors[background];
  document.documentElement.style.backgroundColor = color;
  document.body.style.backgroundColor = color;
  const root = document.getElementById('root');
  if (root) root.style.backgroundColor = color;
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.setAttribute('content', color);
}
