import './style.css';
export const metadata = { title: '慈溪备考 · 公基学习', description: '公基知识学习、真题练习与错题复习。' };
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
