import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { dispatch, InputError } from '../../../lib/study';
import { ZodError } from 'zod';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new InputError('请先登录后使用学习空间',401);
    if (!env.DB) throw new InputError('学习数据库尚未就绪，请稍后重试',503);
    const url = new URL(request.url);
    if (request.method==='POST' && request.headers.get('origin') && request.headers.get('origin')!==url.origin) throw new InputError('请求来源无效',403);
    let data: unknown;
    if (request.method==='POST') {
      const body = await request.text();
      // shortcut: JSON恢复限8MB，长期学习记录超过此限时改为分批恢复。
      if (new TextEncoder().encode(body).length>8_000_000) throw new InputError('提交内容超过8MB限制',413);
      try { data=JSON.parse(body); } catch { throw new InputError('提交内容不是有效JSON'); }
    }
    const result = await dispatch(env.DB,user.userId,request.method,url.pathname.slice(4),data);
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    if (error instanceof ZodError) return Response.json({detail:'输入内容不完整或格式有误：'+error.issues[0]?.path.join('.')},{status:400});
    if (error instanceof InputError) return Response.json({detail:error.message},{status:error.status});
    console.error('Study API failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({detail:'保存或读取失败，请重试；原有记录已保留。'},{status:500});
  }
}
export { handle as GET, handle as POST };
