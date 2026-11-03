"""从既有资料生成网站题库，保留原解析和来源；不改写原数据库。"""
import hashlib
import json
import re
import shutil
import unicodedata
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
OLD = Path(r'C:\Users\26632\OneDrive\Desktop\机器人\cixi-study-system')
MATERIALS = Path('D:/事业编')


def clean(text):
    text = unicodedata.normalize('NFKC', text)
    text = re.sub(r'(?m)^.*(?:小红书[:：]|专注宁波事业编全套资料|关注微信公众号|唯一微信).*\n?', '', text)
    text = re.sub(r'(?m)^\s*202[345]\s*年\s*\d+\s*月.*(?:考试试卷|考试答案及解析)\s*\n', '', text)
    text = re.sub(r'(?m)^\s*\d{1,3}\s*$', '', text)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def direct_explanation(q):
    text = re.split(r'(?:【解析】|解析[:：])', q['analysis'], maxsplit=1)[-1]
    text = re.split(r'(?:【拓展】|\n拓展[:：]?|\n快速解题)', text)[0]
    text = re.sub(r'第[一二三四]步[:：]?', '', text)
    text = re.sub(r'本题(?:主要)?考[查察][^。\n]*[。\n]', '', text)
    text = re.sub(r'\s+', '', text).strip('，,：:;；')
    sentences = re.findall(r'[^。！？]+[。！？]?', text)
    meaningful = [s for s in sentences if not re.fullmatch(r'(?:因此|故|所以|综上|综上所述|本题)[^。]{0,16}(?:选择|选|正确|错误)[A-D、\s]*[。]?', s) and len(s) >= 12]
    # 原解析中的判断理由优先；保留完整句子，不把截断文本冒充结论。
    scored = [(sum(word in s for word in ('错误', '正确', '不得', '应为', '而非', '属于', '指的是', '决定', '题干', '因为', '因此', '关键', '是指')) + 5*sum(bool(re.search(letter+r'(?:项|选项|正确|错误|、)', s)) for letter in q['answer']), i, s.strip('，,：:;；')) for i, s in enumerate(meaningful)]
    selected = sorted(sorted(scored, key=lambda t: (-t[0], t[1]))[:3], key=lambda t: t[1])
    reason = ''.join(s for _, _, s in selected)
    if not reason:
        reason = text
    if len(reason) < 12:
        raise ValueError(f"第{q['id']}题缺少可用的判断依据")
    return reason


def main():
    (ROOT / 'data').mkdir(exist_ok=True)
    assets = ROOT / 'public/materials'
    assets.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in MATERIALS.glob('*.pdf') if p.name.startswith(('2015年10月11日宁波市慈溪市事业单位', '2019年7月13日', '2023年2月26日', '2024年9月28日', '2025年9月21日', '2026公共基础知识学霸笔记')))
    materials, file_ids = [], {}
    for i, p in enumerate(files):
        target = f'/materials/{i}.pdf'
        shutil.copyfile(p, ROOT / 'public' / target.lstrip('/'))
        file_ids[p.name] = i
        materials.append({'id': i, 'name': p.name, 'url': target, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
    records = json.loads((OLD / 'data/library/questions.json').read_text(encoding='utf-8'))
    sample = {q['number']: q for q in json.loads((OLD / 'data/sample/questions.json').read_text(encoding='utf-8'))}
    q2019 = next(p for p in files if p.name.startswith('2019年') and p.name.endswith('试题.pdf'))
    a2019 = next(p for p in files if p.name.startswith('2019年') and p.name.endswith('试题解析.pdf'))
    page_texts = {}
    for p in (q2019, a2019):
        with fitz.open(p) as doc:
            page_texts[p.name] = [unicodedata.normalize('NFKC', page.get_text()) for page in doc]
    for q in records:
        if q['exam'] == '2025年上午卷':
            q['id'] = q['number']
            s = sample[q['number']]
            q['source_page'], q['analysis_page'] = s['question_source']['page'], s['answer_source']['page']
        if q['exam'].startswith('2019年'):
            n = q['number']
            q['type'] = '单选' if n <= 30 else '多选' if n <= 35 else '判断'
            if q['type'] == '判断':
                q['answer'] = {'A': 'A', 'B': 'D'}.get(q['answer'], q['answer'])
            q['question_file'], q['analysis_file'] = str(q2019), str(a2019)
            for field, p in (('source_page', q2019), ('analysis_page', a2019)):
                hits = [i + 1 for i, t in enumerate(page_texts[p.name]) if re.search(rf'(?m)^\s*{n}[.、．\s]', t)]
                if not hits:
                    raise ValueError(f'找不到2019年第{n}题的原文页')
                q[field] = hits[0]
        q['body'], q['analysis'] = clean(q['body']), clean(q['analysis'])
        q['body'] = re.split(r'\n[二三四五六]、(?:多项选择题|判断题|案例分析题|材料写作题)', q['body'])[0].strip()
        q['analysis'] = re.split(r'\n案例分析题【参考解析】', q['analysis'])[0].strip()
        if q['id'] in (24045, 24145):
            q['analysis'] = re.split(r'【材料】', q['analysis'])[0].strip()
        q['question_material'] = file_ids[Path(q.pop('question_file')).name]
        q['analysis_material'] = file_ids[Path(q.pop('analysis_file')).name]
        q['status'] = '争议' if '争议' in q['analysis'] else '待核对'
        q['direct'] = direct_explanation(q)
        q['note'] = ''
        if q['exam'].startswith('2019年') and q['type'] == '判断':
            q['note'] = '原卷判断题用A/B表示正确/错误，网站统一转换为A/D；原解析中的B对应网站的D。'
        q['references'] = []
        q['image'] = ''
        q['version'] = 1
    by_id = {q['id']: q for q in records}
    overrides = json.loads((ROOT / 'data/explanation-overrides.json').read_text(encoding='utf-8'))
    for qid, values in overrides.items():
        by_id[int(qid)].update(values)
    for q in records:
        q['explanation_source'] = '逐题整理' if str(q['id']) in overrides else '原解析要点摘录，待复核'
    # 缺少漫画的题目附上原卷该页，不推断图意。
    q = by_id[23103]
    with fitz.open(files[q['question_material']]) as doc:
        image_path = ROOT / 'public/materials/question-23103.png'
        doc[q['source_page'] - 1].get_pixmap(matrix=fitz.Matrix(1.8, 1.8)).save(image_path)
    q['image'] = '/materials/question-23103.png'
    metadata = {x['page']: x for x in json.loads((OLD / 'data/library/knowledge_metadata.json').read_text(encoding='utf-8'))}
    notes = json.loads((OLD / 'data/library/knowledge.json').read_text(encoding='utf-8'))
    chapters = [(2, '法律法规'), (50, '地理常识'), (65, '历史常识'), (77, '科技常识'), (104, '文学常识'), (129, '航天科技成就'), (134, '经济学'), (139, '管理学'), (143, '马克思主义原理'), (147, '毛泽东思想概论'), (149, '中国特色社会主义'), (170, '中共党史'), (174, '政治名词解释'), (179, '公民道德'), (181, '公文写作')]
    note_id = next(m['id'] for m in materials if m['name'].startswith('2026公共基础'))
    knowledge = json.loads((OLD / 'data/matching/knowledge_units.json').read_text(encoding='utf-8'))
    for k in knowledge:
        k['content'] = k['content'].replace('多教通过', '多数通过')
        k['material'] = note_id
        match = re.search(r'第(\d+)页', k['source'])
        k['page'] = int(match[1]) if match else 2
        if k['id'] == 20040:
            k['page'] = 137
            k['source'] = k['source'].replace('135页', '137页')
        k['module'] = '宪法与立法权限' if k['id'] in (20001, 20002, 20003) else '整理知识卡'
        k['status'] = '已核对' if k['id'] in (20001, 20002, 20003) else '待核对'
    for n in notes:
        meta = metadata.get(n['page'], {})
        category = next(name for start, name in reversed(chapters) if n['page'] >= start)
        knowledge.append({**n, 'category': category, 'chapter': meta.get('chapter', category), 'title': meta.get('title', f"笔记第{n['page']}页"), 'question': meta.get('question', '请离开原文，回忆本页要点。'), 'source': meta.get('source', f"公基学霸笔记PDF第{n['page']}页"), 'module': '原文笔记', 'status': '待核对', 'material': note_id})
    links = json.loads((OLD / 'data/pilot/legislation.json').read_text(encoding='utf-8'))['links']
    for link in links:
        link['status'] = '已确认'
    catalog = {'version': '1.0.0', 'generated': '2026-11-03', 'questions': records, 'knowledge': knowledge, 'materials': materials, 'links': links}
    assert len(records) == 345 and len(by_id) == 345
    assert all(q['answer'] and q['direct'] and q['analysis'] and 1 <= q['source_page'] for q in records)
    assert all(q['answer'] in ('A', 'D') for q in records if q['type'] == '判断')
    assert all(x['question_id'] in by_id for x in links)
    (ROOT / 'data/catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'data/解析核对清单.md').write_text('# 全题解析核对清单\n\n直解摘取自原解析；人工修订项见 explanation-overrides.json。\n\n' + '\n\n'.join(f"## {q['exam']} 第{q['number']}题（{q['status']}）\n\n参考答案：{q['answer']}\n\n{q['direct']}\n\n{q['note']}" for q in records), encoding='utf-8')
    print(json.dumps({'questions': len(records), 'knowledge': len(knowledge), 'materials': len(materials), 'disputed': sum(q['status'] == '争议' for q in records)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
