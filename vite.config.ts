import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages はリポジトリ名のサブパス配下で配信されるので、ビルド時だけ base を付ける。
// 別の場所に置くときは BASE_PATH=/ のように上書きする。
const base = process.env.BASE_PATH ?? '/oogiri-training/';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : base,
  plugins: [react()],
}));
