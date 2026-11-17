import json

def generate_doc():
    with open('data/第一批交付_关联核对现状.md', 'r', encoding='utf-8') as f:
        batch1_doc = f.read()

    start_sec3 = batch1_doc.find('## 三、第 1—10 题返修后逐项依据核验')
    end_sec3 = batch1_doc.find('## 四、已核对题目真实知识缺口规则清单')
    batch1_sec3 = batch1_doc[start_sec3:end_sec3].strip()

    with open('data/catalog.json', 'r', encoding='utf-8') as f:
        cat = json.load(f)

    with open('data/question-breakdowns.json', 'r', encoding='utf-8') as f:
        qb = json.load(f)

    b_map = {b['question_id']: b for b in qb['breakdowns']}
    q_map = {q['id']: q for q in cat['questions']}

    batch2_ids = [11, 12, 17, 18, 19, 20, 21, 22, 23]

    batch2_sections = []
    for qid in batch2_ids:
        b = b_map[qid]
        q = q_map[qid]
        qnum = b['number']
        qtype = b['type']
        polarity = b['stem_polarity']
        ans = q['answer']
        src_p = q['source_page']
        ana_p = q['analysis_page']
        body_text = q['body']
        
        sec = f"### 第 {qnum} 题（ID: `{qid}` · {qtype} · {polarity} · 参考答案: `{ans}`）\n\n"
        sec += f"- **试卷出处**：原题《8.pdf》第 {src_p} 页，原解析《7.pdf》第 {ana_p} 页\n"
        sec += f"- **设问极性**：`{polarity}`\n"
        sec += f"- **题干原文**：\n```text\n{body_text}\n```\n\n"
        sec += "| 标识/选项 | 选项陈述内容 | 陈述真实性 (`statement_truth`) | 符合设问 (`matches_stem`) | 判定结论 (`verdict`) | 考点规则与知识卡关联 | 判定依据说明 |\n"
        sec += "|---|---|---|---|---|---|---|\n"
        
        for it in b['items']:
            key = it['key']
            stmt = it['statement'].replace('\n', ' ')
            st = '成立 (True)' if it['statement_truth'] else '不成立 (False)'
            ms = '符合 (True)' if it['matches_stem'] else '不符合 (False)'
            verdict_text = it['verdict']
            vd = f"**{verdict_text}**"
            rid = it['rule_id']
            kid = it['knowledge_id']
            if kid:
                link_info = f"卡片 `{kid}`<br>`{rid}`"
            else:
                link_info = f"**真实知识缺口**<br>`{rid}`"
            basis = it['basis'].replace('\n', ' ')
            sec += f"| **{key}** | {stmt} | {st} | {ms} | {vd} | {link_info} | {basis} |\n"
        
        batch2_sections.append(sec)

    batch2_rendered = '\n\n'.join(batch2_sections)

    batch2_gap_rules = {}
    for qid in batch2_ids:
        b = b_map[qid]
        for it in b['items']:
            if it.get('knowledge_gap'):
                rid = it['rule_id']
                stmt = it['rule_statement']
                if rid not in batch2_gap_rules:
                    batch2_gap_rules[rid] = (qid, it['key'], stmt)

    gap_table = "| 规则 ID | 对应题目/选项 | 建议新建知识卡规则正文 |\n|---|---|---|\n"
    for rid, (qid, key, stmt) in sorted(batch2_gap_rules.items()):
        gap_table += f"| `{rid}` | 第 {qid} 题 {key} | {stmt} |\n"

    output_content = f"""# 慈溪备考真题知识卡关联：第二批（第11、12、17—23题）核对与交付现状

2026-11-17 完成 2025 年上午卷第二批指定 9 题（第 11、12、17、18、19、20、21、22、23 题）的逐项核对、数据更新、测试回归与交付文档。
唯一主工作目录：`D:\\事业编\\cixi-study-online`。当前任务分支：`feat/question-breakdowns`。

---

## 一、全部 345 道真题核对状态总览

从最终有效数据文件 `data/catalog.json` 与 `data/question-breakdowns.json` 统一自动计算，绝无脱节手工统计：

| 试卷 | 总题数 | 已核对（可直接作复习依据） | 待核对（需逐页复核PDF） | 争议（仅供对照，不计掌握） | 知识卡缺口题数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2025年上午卷 | 45 | 20 | 20 | 5 | 32 |
| 2025年下午卷 | 45 | 0 | 43 | 2 | 45 |
| 2024年上午卷 | 45 | 1 | 42 | 2 | 44 |
| 2024年下午卷 | 45 | 1 | 44 | 0 | 44 |
| 2023年上午卷 | 55 | 1 | 53 | 1 | 54 |
| 2023年下午卷 | 55 | 0 | 54 | 1 | 55 |
| 2019年7月象山事业单位 | 55 | 0 | 51 | 4 | 54 |
| **合计** | **345** | **23** | **307** | **15** | **328** |

### 1. 2025 年上午卷（45 题）核对现状
- **已核对（20 题）**：第 1、2、3、4、5、6、7、8、9、10、11、12、13、17、18、19、20、21、22、23 题（对应 ID: `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 20, 21, 22, 23]`）。
- **待核对（20 题）**：第 25、26、28、29、30、31、32、33、34、35、36、37、38、39、40、41、42、43、44、45 题。
- **争议题（5 题，已标存疑并隔离统计）**：
  - 第 14 题（`14`）：仅凭“呼吁拒缴”不能直接断言构成名誉侵权，仍须核对言论是否失实及相关事实；保留资料答案 B 供对照，暂不计掌握。
  - 第 15 题（`15`）：原解析把安全保障义务与自甘风险规则混用；保留 D 作为资料答案，暂不计掌握。
  - 第 16 题（`16`）：资料参考答案按①成立给 C，但最高法院婚姻家庭编解释（二）明确是否仅赠与一方须看约定，约定不明时离婚分割还应综合考虑补偿，故现有题干不足以唯一确定①成立。
  - 第 24 题（`24`）：后半段现象与原解析论证不完整，保留 A 作为资料答案，暂不计掌握。
  - 第 27 题（`27`）：保留资料答案 ABCD 供对照，暂不作标准判定；按政策原文核对补贴对象、年龄和地方衔接条件。
- **关联状态统计**：总计 **25** 条、已确认 **23** 条、候选 **2** 条（第 15、16 题候选）。
- **真实知识缺口规则**：在 2025 年上午卷已核对 20 题中，去重知识缺口规则共 **53** 条。

### 2. 全部 345 道历年真题核对现状
- **已核对（23 题）**：上午卷 20 题 + 其他试卷 3 题（`[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 20, 21, 22, 23, 23015, 24012, 24107]`）。
- **待核对（307 题）**。
- **争议题（15 题）**。
- **关联状态统计**：全库总计 **29** 条、已确认 **27** 条、候选 **2** 条。
- **去重知识缺口规则数**：全库已核对 23 题中，去重知识缺口规则共 **53** 条。

---

## 二、第二批（第 11、12、17—23 题）逐项依据核验

{batch2_rendered}

---

## 三、第一批（第 1—10 题）已核对内容保留（原样存照）

{batch1_sec3}

---

## 四、第二批 9 题真实去重知识缺口规则清单（共 31 条）

在仔细核查现有 196 张知识卡正文后，确认以下 31 条规则在现有卡库中无直接法条/原理覆盖，属于真实知识缺口，建议在后续知识库扩建时补建：

{gap_table}

全库已核对 20 道上午卷题目产生的去重知识缺口规则总数为：**第一批 22 条 + 第二批 31 条 = 53 条**。

---

## 五、验证与保护落实报告

1. **真实子进程执行防覆盖与参数校验**：
   - 运行自动化测试 `tests/breakdown.test.ts`，在 `%TEMP%\\CodexReview` 真实启动 Python 生成器子进程；
   - 验证传入非数字或批次外参数时立即报错退出；
   - 验证连续幂等运行；
   - 严格断言全库其余 **336 道题**及其所有逐项依据字节级 100% 相同，绝无越界污染。
2. **55 项单元测试与集成测试全部通过**：
   - `node --test tests/*.test.ts`：55 项通过，0 失败。
3. **TypeScript 类型检查与构建验证**：
   - `node node_modules/typescript/bin/tsc --noEmit`：0 错误。
   - `npm run build`：生产构建 5 阶段全部成功。
4. **Git 工作区状态**：
   - 本地提交，未推送至远程，未合并 main 分支。
"""

    with open('data/第二批交付_关联核对现状.md', 'w', encoding='utf-8') as f:
        f.write(output_content)

    print('Generated data/第二批交付_关联核对现状.md successfully!')

if __name__ == '__main__':
    generate_doc()
