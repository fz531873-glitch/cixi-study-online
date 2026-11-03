import './style.css';
export const metadata = { title: '慈溪备考 · 公基学习', description: '背诵有检查，真题有直解，错题有回访。' };
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
