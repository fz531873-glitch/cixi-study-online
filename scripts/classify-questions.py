#!/usr/bin/env python3
"""Classify all 345 real exam questions in data/catalog.json into the 15 canonical knowledge categories."""

import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT / "data" / "catalog.json"
SIM_PATH = ROOT / "data" / "simulations.json"
BREAKDOWN_PATH = ROOT / "data" / "question-breakdowns.json"

CANONICAL_CATEGORIES = [
    "法律法规",
    "中国特色社会主义",
    "经济学",
    "马克思主义原理",
    "管理学",
    "科技常识",
    "公文写作",
    "历史常识",
    "文学常识",
    "地理常识",
    "政治名词解释",
    "中共党史",
    "公民道德",
    "毛泽东思想概论",
    "航天科技成就",
]


def classify_question(q: dict, tpl_cats: dict[int, str], link_cats: dict[int, str]) -> str:
    qid = q["id"]
    if qid in tpl_cats:
        return tpl_cats[qid]
    if qid in link_cats:
        return link_cats[qid]

    analysis = q.get("analysis", "")
    body = q.get("body", "")
    direct = q.get("direct", "")
    m = re.search(r"本题考查([^。\n]+)", analysis)
    hint = m.group(1) if m else ""
    text = f"{hint}\n{body}\n{direct}"

    # Check explicit subject hint first ("本题考查...")
    if any(k in hint for k in ["公文", "纪要", "函", "请示", "报告", "通知"]):
        return "公文写作"
    if any(k in hint for k in ["党史", "中国共产党历史", "延安", "遵义", "长征", "中共"]):
        return "中共党史"
    if "毛泽东" in hint:
        return "毛泽东思想概论"
    if any(k in hint for k in ["航天", "神舟", "嫦娥", "天问", "空间站", "卫星"]):
        return "航天科技成就"
    if any(k in hint for k in ["地理", "国情", "气候", "地震", "月全食", "天文"]):
        return "地理常识" if any(w in text for w in ["地形", "气候", "经纬", "月全食", "地震", "地理", "洋流", "河流"]) else "中国特色社会主义"
    if any(k in hint for k in ["历史", "朝代", "元朝", "抗日战争", "抗战", "近代史"]):
        return "历史常识"
    if any(k in hint for k in ["文学", "诗词", "成语", "传统医学", "中医药", "文化常识"]):
        if any(w in text for w in ["元朝", "宋朝", "唐朝", "清朝", "历史", "纪念", "抗战", "烈士", "抗日"]):
            return "历史常识"
        return "文学常识"
    if any(k in hint for k in ["道德", "伦理", "诚信", "敬业"]):
        return "公民道德"
    if any(k in hint for k in ["管理", "行政管理", "组织", "决策", "领导", "冲突"]):
        return "管理学"
    if any(k in hint for k in ["唯物", "辩证", "认识论", "哲学", "马原", "马克思主义哲学", "矛盾", "实践"]):
        return "马克思主义原理"
    if any(k in hint for k in ["政治经济学", "经济", "市场", "货币", "财政", "GDP", "通胀", "汇率", "消费"]):
        return "经济学"
    if any(k in hint for k in ["法", "宪法", "民法", "刑法", "行政诉讼", "民事诉讼", "行政复议", "国家机构", "立法", "反垄断", "劳动合同", "婚姻", "物权", "侵权", "治安"]):
        return "法律法规"
    if any(k in hint for k in ["生物", "医学", "物理", "化学", "科技", "计算机", "热射病", "病毒", "消毒", "U盘"]):
        return "科技常识"
    if any(k in hint for k in ["习近平", "新时代", "时事", "时政", "中特", "社会", "中国式现代化", "全过程人民民主", "生态文明", "民族区域自治", "政治"]):
        return "中国特色社会主义"

    # Fallback on full text
    if any(k in text for k in ["公文", "请示", "会议纪要", "平行文", "函"]):
        return "公文写作"
    if any(k in text for k in ["法典", "法律", "条例", "民法", "刑法", "宪法", "诉讼", "仲裁", "劳动合同", "反垄断"]):
        return "法律法规"
    if any(k in text for k in ["经济学", "市场经济", "GDP", "通货膨胀", "财政", "货币政策", "赤字率", "再贷款"]):
        return "经济学"
    if any(k in text for k in ["哲学", "唯物", "辩证法", "形而上学", "认识论", "生产力", "生产关系", "社会存在"]):
        return "马克思主义原理"
    if any(k in text for k in ["管理学", "决策", "冲突", "激励", "行政效能"]):
        return "管理学"
    if any(k in text for k in ["消毒液", "热射病", "U盘", "生物", "物理", "化学", "下丘脑", "亚种"]):
        return "科技常识"
    if any(k in text for k in ["月全食", "经度", "纬度", "气候", "地理"]):
        return "地理常识"
    if any(k in text for k in ["元朝", "抗日战争", "历史", "朝代"]):
        return "历史常识"
    if any(k in text for k in ["中医", "传统医学", "诗词", "文学"]):
        return "文学常识"
    return "中国特色社会主义"


def main() -> None:
    cat = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    sim = json.loads(SIM_PATH.read_text(encoding="utf-8"))

    tpl_cats = {q["template_question_id"]: q["category"] for q in sim["questions"] if q.get("template_question_id")}
    k_cats = {k["id"]: k["category"] for k in cat["knowledge"]}
    link_cats = {
        l["question_id"]: k_cats[l["knowledge_id"]]
        for l in cat["links"]
        if l.get("status") == "已确认" and l["knowledge_id"] in k_cats
    }

    counts = collections.Counter()
    cat_by_id: dict[int, str] = {}
    for q in cat["questions"]:
        c = classify_question(q, tpl_cats, link_cats)
        assert c in CANONICAL_CATEGORIES, f"Invalid category {c} for {q['id']}"
        q["category"] = c
        cat_by_id[q["id"]] = c
        counts[c] += 1

    CATALOG_PATH.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")

    if BREAKDOWN_PATH.exists():
        bd = json.loads(BREAKDOWN_PATH.read_text(encoding="utf-8"))
        for entry in bd["breakdowns"]:
            entry["category"] = cat_by_id[entry["question_id"]]
        BREAKDOWN_PATH.write_text(json.dumps(bd, ensure_ascii=False, indent=2), encoding="utf-8")

    print("Classified all", len(cat["questions"]), "real exam questions:")
    for k, v in counts.most_common():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
