#!/usr/bin/env python3
"""Generate structured per-item question breakdowns and verification statistics for all 345 real exam questions."""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CIXI_PROJECT_ROOT", Path(__file__).resolve().parent.parent))
CATALOG_PATH = Path(os.environ.get("CIXI_CATALOG_PATH", ROOT / "data" / "catalog.json"))
OUT_JSON = Path(os.environ.get("CIXI_BREAKDOWNS_PATH", ROOT / "data" / "question-breakdowns.json"))
OUT_MD = Path(os.environ.get("CIXI_BREAKDOWNS_MD_PATH", ROOT / "data" / "全量真题逐项依据与核对统计.md"))

REVERSE_STEM_RE = re.compile(
    r"(错误的是|不正确的是|说法有误|表述有误|不包括|不属于|不符合|无关的是|较不利于|不能|没有体现)"
)

EXAM_ORDER = [
    "2025年上午卷",
    "2025年下午卷",
    "2024年上午卷",
    "2024年下午卷",
    "2023年上午卷",
    "2023年下午卷",
    "2019年7月象山事业单位",
]


def detect_polarity(qtype: str, body: str) -> str:
    if qtype == "判断":
        return "判断正误"
    return "选错误" if REVERSE_STEM_RE.search(body) else "选正确"


def split_option_keys(qtype: str, body: str) -> tuple[list[str], dict[str, str] | None]:
    if qtype == "判断":
        return ["判断"], None
    # Detect combination choices like A、23 B、14 or A.12 B.14
    option_matches = list(re.finditer(r"(?:^|\s)([A-D])[.．、]\s*", body, re.M))
    if len(option_matches) >= 4:
        choices: dict[str, str] = {}
        for idx, m in enumerate(option_matches[-4:]):
            letter = m.group(1)
            start = m.end()
            end = option_matches[-4:][idx + 1].start() if idx + 1 < 4 else len(body)
            choices[letter] = re.sub(r"\s+", "", body[start:end])
        if all(re.fullmatch(r"[1-9①-⑨、,，]+", v) for v in choices.values()):
            comb_map = {}
            circled = "①②③④⑤⑥⑦⑧⑨"
            for letter, val in choices.items():
                nums = re.findall(r"[1-9①-⑨]", val)
                comb_map[letter] = [
                    circled[int(n) - 1] if n.isdigit() else n for n in nums
                ]
            all_keys = []
            for ks in comb_map.values():
                for k in ks:
                    if k not in all_keys:
                        all_keys.append(k)
            all_keys.sort()
            return all_keys, comb_map
    return ["A", "B", "C", "D"], None


def extract_item_basis(key: str, direct: str, analysis: str, fallback: str) -> str:
    # Try to find a sentence specifically mentioning this option/statement key
    text = f"{direct}\n{analysis}"
    circled = "①②③④⑤⑥⑦⑧⑨"
    candidates = [key]
    if key in circled:
        candidates.append(str(circled.index(key) + 1))
    for cand in candidates:
        pattern = re.compile(
            rf"(?:^|[。；;\n])\s*(?:{re.escape(cand)}项?|{re.escape(cand)}[：:、.])([^。\n]+。?)"
        )
        m = pattern.search(text)
        if m:
            snippet = m.group(0).strip(" 。；;\n")
            if len(snippet) >= 6:
                return snippet + ("。" if not snippet.endswith("。") else "")
    return fallback


def hand_curated_overrides(materials: dict[int, str]) -> dict[int, dict]:
    def src(qm: int, qp: int, am: int, ap: int, loc_q: str, loc_a: str, ext: str | None = None) -> dict:
        d = {
            "question_material": {"id": qm, "name": materials[qm], "page": qp, "location": loc_q},
            "analysis_material": {"id": am, "name": materials[am], "page": ap, "location": loc_a},
        }
        if ext:
            d["external"] = ext
        return d

    overrides = {
        1: {
            "stem_polarity": "选错误",
            "items": [
                {"key": "A", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "“坚持求同存异”属于习近平主席在上海合作组织峰会重要讲话提出的五项主张之一。", "source_ref": src(8, 1, 7, 2, "第1题A项", "第1题解析"), "rule_id": "RULE-POL-SCO-2025-01", "rule_statement": "2025年上合峰会五项主张为求同存异、互利共赢、开放包容、公平正义、务实高效。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "B", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "“坚持互利共赢”属于上合峰会重要讲话提出的五项主张之一。", "source_ref": src(8, 1, 7, 2, "第1题B项", "第1题解析"), "rule_id": "RULE-POL-SCO-2025-01", "rule_statement": "2025年上合峰会五项主张为求同存异、互利共赢、开放包容、公平正义、务实高效。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "C", "statement_truth": False, "matches_stem": True, "verdict": "入选", "basis": "“坚持独立自主”未列入此次讲话展望未来的五项主张之中，符合反向设问“不包括”。", "source_ref": src(8, 1, 7, 2, "第1题C项", "第1题解析"), "rule_id": "RULE-POL-SCO-2025-01", "rule_statement": "2025年上合峰会五项主张为求同存异、互利共赢、开放包容、公平正义、务实高效，不含“独立自主”。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "D", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "“坚持公平正义”属于上合峰会重要讲话提出的五项主张之一。", "source_ref": src(8, 1, 7, 2, "第1题D项", "第1题解析"), "rule_id": "RULE-POL-SCO-2025-01", "rule_statement": "2025年上合峰会五项主张为求同存异、互利共赢、开放包容、公平正义、务实高效。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        2: {
            "stem_polarity": "选正确",
            "combination_map": {"A": ["①", "②"], "B": ["③", "④"], "C": ["①", "②", "④"], "D": ["①", "②", "③", "④"]},
            "items": [
                {"key": "①", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "坚决纠正不作为、乱作为属于严格规范行政执法的要求，陈述成立；但题干设问针对的是整治形式主义、为基层松绑减负的举措，执法监督不属该专项直接对策，不符合设问。", "source_ref": src(8, 1, 7, 2, "第2题陈述①", "第2题解析"), "rule_id": "RULE-POL-GRASSROOTS-BURDEN-01", "rule_statement": "持续为基层松绑减负、纠治形式主义官僚主义，关键在树立正确政绩观与重实绩导向；执法监督不属直接对策。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "②", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "规范执法、公开透明属于推进政务公开和法治政府建设的要求，陈述成立；但并非针对基层形式主义困扰的松绑减负靶向举措，不符合设问。", "source_ref": src(8, 1, 7, 2, "第2题陈述②", "第2题解析"), "rule_id": "RULE-POL-GRASSROOTS-BURDEN-01", "rule_statement": "持续为基层松绑减负、纠治形式主义官僚主义，关键在树立正确政绩观与重实绩导向；执法监督不属直接对策。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "③", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "克服形式主义必须从思想根源发力，引导党员干部树立正确政绩观、切实改进作风，坚决杜绝过度留痕与文山会海。", "source_ref": src(8, 1, 7, 2, "第2题陈述③", "第2题解析"), "rule_id": "RULE-POL-GRASSROOTS-BURDEN-01", "rule_statement": "持续为基层松绑减负、纠治形式主义官僚主义，关键在树立正确政绩观与重实绩导向。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "④", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "树立重实干、重实绩的考核与用人导向，能有效激励基层干部真抓实干担当作为，从制度上克服形式主义。", "source_ref": src(8, 1, 7, 2, "第2题陈述④", "第2题解析"), "rule_id": "RULE-POL-GRASSROOTS-BURDEN-01", "rule_statement": "持续为基层松绑减负、纠治形式主义官僚主义，关键在树立正确政绩观与重实绩导向。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        3: {
            "stem_polarity": "选正确",
            "combination_map": {"A": ["①", "②", "③"], "B": ["①", "②", "④"], "C": ["②", "③", "④"], "D": ["①", "②", "③", "④"]},
            "items": [
                {"key": "①", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "坚持党的领导和中国特色社会主义道路，是西藏各项事业取得全方位进步与历史性成就的根本政治保证。", "source_ref": src(8, 1, 7, 2, "第3题陈述①", "第3题解析"), "rule_id": "RULE-POL-TIBET-ACHIEVEMENT-01", "rule_statement": "西藏各项事业取得历史性成就的根本在于坚持党的领导与走中国特色社会主义道路。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "②", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "坚持和完善民族区域自治制度保障了少数民族当家作主和管理本地方事务的权利，是西藏繁荣发展的制度基础。", "source_ref": src(8, 1, 7, 2, "第3题陈述②", "第3题解析"), "rule_id": "RULE-POL-ETHNIC-AUTONOMY-01", "rule_statement": "坚持和完善民族区域自治制度，保障少数民族当家作主管理本民族本地方事务的自治权利。", "knowledge_id": 10158, "knowledge_gap": False},
                {"key": "③", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "全国各族人民大力支援与共同奋斗，巩固了平等团结互助和谐的社会主义民族关系，为西藏全面发展汇聚强大合力。", "source_ref": src(8, 1, 7, 2, "第3题陈述③", "第3题解析"), "rule_id": "RULE-POL-ETHNIC-RELATIONS-01", "rule_statement": "我国社会主义民族关系是平等团结互助和谐，各民族共同繁荣发展。", "knowledge_id": 10158, "knowledge_gap": False},
                {"key": "④", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "我国当前处于“全面建设社会主义现代化国家”新征程，目标到本世纪中叶才“全面建成社会主义现代化强国”，④时态与阶段表述错误。", "source_ref": src(8, 2, 7, 2, "第3题陈述④", "第3题解析"), "rule_id": "RULE-POL-MODERNIZATION-STAGE-01", "rule_statement": "我国当前处于全面建设社会主义现代化国家阶段，尚未全面建成社会主义现代化强国。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        4: {
            "stem_polarity": "选正确",
            "items": [
                {"key": "A", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "党和国家的中心工作是经济建设，协调发展是新发展理念之一，不能混为中心工作。", "source_ref": src(8, 2, 7, 2, "第4题A项", "第4题解析"), "rule_id": "RULE-POL-ECONOMIC-CENTER-01", "rule_statement": "党在社会主义初级阶段的基本路线明确以经济建设为中心，中心工作是经济建设而非协调发展。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "B", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "“两岸”在我国政策语境中特指大陆与台湾海峡两岸；粤港澳大湾区由广东省与香港、澳门特区构成，用词错误。", "source_ref": src(8, 2, 7, 2, "第4题B项", "第4题解析"), "rule_id": "RULE-POL-CROSS-STRAIT-TERM-01", "rule_statement": "「两岸」特指大陆与台湾海峡两岸，不能用于指代粤港澳大湾区内部协同发展。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "C", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "铸牢中华民族共同体意识是新时代党的民族工作主线，原理陈述成立；但粤港澳大湾区战略着眼于内地与港澳特区的跨境体制机制对接与协同发展，并非针对民族工作领域，不符合设问。", "source_ref": src(8, 2, 7, 2, "第4题C项", "第4题解析"), "rule_id": "RULE-POL-COMMUNITY-CONSCIOUSNESS-01", "rule_statement": "铸牢中华民族共同体意识是民族工作的主线，与粤港澳特区跨境协同发展的战略定位不直接契合。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "D", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "粤港澳大湾区建设是推动内地与港澳互利合作、保持香港澳门长期繁荣稳定的重大国家战略，丰富拓展了“一国两制”的生动实践。", "source_ref": src(8, 2, 7, 2, "第4题D项", "第4题解析"), "rule_id": "RULE-POL-ONE-COUNTRY-TWO-SYSTEMS-01", "rule_statement": "推进粤港澳大湾区建设是不断丰富和拓展「一国两制」生动实践、保持港澳长期繁荣稳定的重大战略举措。", "knowledge_id": 10167, "knowledge_gap": False},
            ],
        },
        5: {
            "stem_polarity": "选正确",
            "items": [
                {"key": "A", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "“十五五”规划尚在编制阶段，通过网络征求广大网民建言献策属于在决策形成前汇聚民意民智，属于公民通过社情民意反映制度参与民主决策。", "source_ref": src(8, 2, 7, 2, "第5题A项", "第5题解析"), "rule_id": "RULE-POL-DEMOCRACY-DECISION-01", "rule_statement": "重大规划或政策法规编制前广泛征求公众建言献策，属于公民参与民主决策。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "B", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "民主协商是社会主义协商民主的重要实现形式，陈述成立；但重大发展规划在起草阶段面向全社会公开征集公众建言献策，属于公民参与民主决策，不符合设问。", "source_ref": src(8, 2, 7, 2, "第5题B项", "第5题解析"), "rule_id": "RULE-POL-DEMOCRACY-CONSULT-01", "rule_statement": "民主协商侧重多方平等对话沟通寻求共识，重大规划起草前网络征求公众建言属于民主决策。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "C", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "基层群众自治制度促进群众在城乡社区治理中依法自我管理、自我服务、自我教育、自我监督，民主管理陈述成立；与国家编制“十五五”规划性质不符，不符合设问。", "source_ref": src(8, 2, 7, 2, "第5题C项", "第5题解析"), "rule_id": "RULE-POL-DEMOCRACY-MGMT-01", "rule_statement": "完善基层群众自治制度是民主政治建设的基础，群众在社区治理中依法自我管理与民主管理；规划编制属于民主决策。", "knowledge_id": 10158, "knowledge_gap": False},
                {"key": "D", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "民主监督的核心功能是公民对国家机关及其公职人员行使公权力和履行法定职责进行批评、建议、监督与纠偏，陈述成立；题干中面向社会公开征求规划编制的建言献策属于为公共政策制定提供民意民智支持的民主决策，不属于监督纠偏公权力履职，不符合设问。", "source_ref": src(8, 2, 7, 2, "第5题D项", "第5题解析"), "rule_id": "RULE-POL-DEMOCRACY-SUPERVISION-01", "rule_statement": "民主监督侧重对国家机关及其工作人员行使公权力和履行职责进行监督与纠偏，规划起草征集公众建言属于民主决策。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        6: {
            "stem_polarity": "选正确",
            "items": [
                {"key": "A", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "认识具有反复性指认识受主客观条件限制需经过多次反复才能达到真理，原理陈述成立；但题干体现的是人们生活方式与审美时尚的变迁，不涉及认识过程的反复曲折，不符合设问。", "source_ref": src(8, 2, 7, 3, "第6题A项", "第6题解析"), "rule_id": "RULE-PHIL-KNOWLEDGE-REPEATED-01", "rule_statement": "认识具有反复性指认识受主客观条件限制需经过多次反复才能达到正确真理，题干未体现该认知过程。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "B", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "价值判断与价值选择具有主体差异性原理成立；但题干展现的是当代年轻人面对快节奏生活普遍复兴亲近自然与簪花时尚，反映群体共性追求，未体现不同主体间价值评判的截然对立与差异，不符合设问。", "source_ref": src(8, 2, 7, 3, "第6题B项", "第6题解析"), "rule_id": "RULE-PHIL-VALUE-CHOICE-DIFF-01", "rule_statement": "主体差异性强调由于立场需要不同导致不同主体产生不同价值判断，题干强调当代共性时尚而非个体差异。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "C", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "都市生活节奏加快与生活压力的现实客观环境（社会存在），催生了年轻人拥抱自然、复兴簪花以求身心舒缓的生活理念与审美追求（社会意识），体现社会存在决定社会意识。", "source_ref": src(8, 2, 7, 3, "第6题C项", "第6题解析"), "rule_id": "RULE-PHIL-SOCIAL-BEING-01", "rule_statement": "社会存在决定社会意识，社会存在的变化决定社会意识的变化；客观生活压力与生存条件驱动生活观念和审美时尚变化。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "D", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "实践的基本特征包括自觉能动性、社会历史性和直接现实性，陈述成立；但题干主旨在于揭示快节奏都市生活条件驱动了生活理念和审美时尚变化，最直接体现社会存在决定社会意识，D项不符合设问最主要体现的哲理。", "source_ref": src(8, 2, 7, 3, "第6题D项", "第6题解析"), "rule_id": "RULE-PHIL-PRACTICE-HISTORICAL-01", "rule_statement": "实践的基本特征包括自觉能动性、社会历史性和直接现实性；材料主旨体现社会存在决定社会意识而非实践特征。", "knowledge_id": 10145, "knowledge_gap": False},
            ],
        },
        7: {
            "stem_polarity": "选正确",
            "combination_map": {"A": ["①", "②"], "B": ["①", "④"], "C": ["①", "②", "③"], "D": ["①", "②", "③", "④"]},
            "items": [
                {"key": "①", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "发挥新型举国体制优势、全面加强科技攻关与提升体系化创新能力，有力支撑高质量发展，直接体现了创新是引领发展的第一动力。", "source_ref": src(8, 2, 7, 3, "第7题陈述①", "第7题解析"), "rule_id": "RULE-POL-INNOVATION-FIRST-POWER-01", "rule_statement": "科技创新是提升国家体系化创新能力、支撑高质量发展的关键，创新是引领发展的第一动力。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "②", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "辩证的否定是事物联系和发展的环节，其实质是扬弃，哲学陈述成立；但题干强调面向未来全面布局科技攻关与体制改革，未重点展开论述辩证否定中关于旧事物向新事物发展及扬弃的过程，不符合材料设问。", "source_ref": src(8, 2, 7, 3, "第7题陈述②", "第7题解析"), "rule_id": "RULE-PHIL-DIALECTICAL-NEGATION-01", "rule_statement": "辩证否定是事物联系和发展的环节其实质是扬弃；科技会议工作部署未重点体现辩证否定的发展环节。", "knowledge_id": 10144, "knowledge_gap": False},
                {"key": "③", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "马克思主义哲学基本原理明确：经济基础决定上层建筑，上层建筑反作用于经济基础；③将二者因果关系倒置，理论陈述严重错误。", "source_ref": src(8, 2, 7, 3, "第7题陈述③", "第7题解析"), "rule_id": "RULE-PHIL-BASE-SUPERSTRUCTURE-01", "rule_statement": "经济基础决定上层建筑，上层建筑对经济基础具有反作用；不能倒置表述为上层建筑决定经济基础。", "knowledge_id": 20050, "knowledge_gap": False},
                {"key": "④", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "坚持“四个面向”与新型举国体制，既全面加强科技体制改革和体系布局（两点论），又着力突破关键核心技术与体系攻关（重点论），坚持了两点论与重点论相统一。", "source_ref": src(8, 2, 7, 3, "第7题陈述④", "第7题解析"), "rule_id": "RULE-PHIL-TWO-POINT-FOCUS-01", "rule_statement": "坚持两点论和重点论的统一，既要全面看问题，又要着重抓住主要矛盾和矛盾的主要方面。", "knowledge_id": 10144, "knowledge_gap": False},
            ],
        },
        8: {
            "stem_polarity": "选错误",
            "items": [
                {"key": "A", "statement_truth": False, "matches_stem": True, "verdict": "入选", "basis": "生产力三要素中，生产工具（劳动资料）是衡量生产力发展水平的客观标志；劳动者是生产力中最活跃的主导因素。A将客观标志归于劳动能力，混淆了标志与主导因素，说法错误，符合反向设问。", "source_ref": src(8, 2, 7, 3, "第8题A项", "第8题解析"), "rule_id": "RULE-PHIL-PRODUCTIVITY-TOOL-01", "rule_statement": "生产工具是生产力发展水平的客观标志；劳动者是生产力中最活跃的主导因素；二者地位不能混淆。", "knowledge_id": 10145, "knowledge_gap": False},
                {"key": "B", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "历史唯物主义基本原理表明：生产力决定生产关系，生产力状况决定生产关系性质，生产力的发展变化最终引起生产关系变革，表述完全正确。", "source_ref": src(8, 2, 7, 3, "第8题B项", "第8题解析"), "rule_id": "RULE-PHIL-PRODUCTIVITY-RELATION-01", "rule_statement": "生产力决定生产关系，生产力状况决定生产关系性质，生产力的发展变化必然引起生产关系的变革。", "knowledge_id": 10145, "knowledge_gap": False},
                {"key": "C", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "封建土地所有制属于生产关系范畴，当其滞后于生产力发展时会阻碍工业资本扩张，典型体现生产关系反作用于生产力，表述正确。", "source_ref": src(8, 2, 7, 3, "第8题C项", "第8题解析"), "rule_id": "RULE-PHIL-PRODUCTIVITY-RELATION-01", "rule_statement": "生产关系对生产力具有能动的反作用，落后的生产关系会阻碍生产力的发展。", "knowledge_id": 10145, "knowledge_gap": False},
                {"key": "D", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "新质生产力的内涵表述与中央权威界定完全一致，表述正确。", "source_ref": src(8, 2, 7, 3, "第8题D项", "第8题解析"), "rule_id": "RULE-ECON-NEW-PRODUCTIVITY-01", "rule_statement": "新质生产力由技术革命性突破、生产要素创新性配置、产业深度转型升级催生，是符合新发展理念的先进生产力质态。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        9: {
            "stem_polarity": "选正确",
            "items": [
                {"key": "A", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "央行降低再贷款利率能降低商业银行融资成本，推动信贷和货币供给扩张，增加市场流动性，属于扩张性货币政策。", "source_ref": src(8, 3, 7, 3, "第9题A项", "第9题解析"), "rule_id": "RULE-ECON-MONETARY-EXPANSION-01", "rule_statement": "扩张性货币政策通过降准、降息、降低再贷款利率或公开市场逆回购增加市场货币供应量与流动性。", "knowledge_id": 20040, "knowledge_gap": False},
                {"key": "B", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "提高法定存款准备金率是规范的货币政策工具，陈述成立；它会减少商业银行可贷资金，收紧流动性，属于紧缩性货币政策，题干要求选扩张性货币政策工具，不符合设问。", "source_ref": src(8, 3, 7, 3, "第9题B项", "第9题解析"), "rule_id": "RULE-ECON-MONETARY-TIGHT-01", "rule_statement": "提高存款准备金率属于紧缩性货币政策，收紧市场流动性。", "knowledge_id": 20040, "knowledge_gap": False},
                {"key": "C", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "央行发行票据回笼货币是规范的公开市场操作，陈述成立；但该操作直接减少市场基础货币，属于紧缩性政策工具，题干要求选扩张性货币政策工具，不符合设问。", "source_ref": src(8, 3, 7, 3, "第9题C项", "第9题解析"), "rule_id": "RULE-ECON-MONETARY-TIGHT-02", "rule_statement": "央行发行票据回笼货币属于紧缩性操作。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "D", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "“存贷比”是商业银行流动性监管指标而非利率指标，不存在“存贷比基准利率”政策工具，且上调利率通常偏向紧缩而非扩张，用语不规范且陈述不成立，排除。", "source_ref": src(8, 3, 7, 3, "第9题D项", "第9题解析"), "rule_id": "RULE-ECON-MONETARY-EXPANSION-01", "rule_statement": "存贷比是监管指标非基准利率，且上调利率偏向紧缩而非扩张。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        10: {
            "stem_polarity": "选正确",
            "combination_map": {"A": ["①", "②", "③"], "B": ["①", "②", "④"], "C": ["①", "③", "④"], "D": ["①", "②", "③", "④"]},
            "items": [
                {"key": "①", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "空中出租车与低空航线开辟了三维立体交通通道，强化了区域枢纽间的高效接驳与互联互通。", "source_ref": src(8, 3, 7, 3, "第10题陈述①", "第10题解析"), "rule_id": "RULE-ECON-LOW-ALTITUDE-01", "rule_statement": "低空经济依托垂直起降飞行器与通航体系，能够完善立体交通网络并提升区域互联互通水平。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "②", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "低空文旅、无人机配送与打“飞的”通勤培育了新型消费场景，满足人民群众高品质、多样化的出行与生活需求。", "source_ref": src(8, 3, 7, 3, "第10题陈述②", "第10题解析"), "rule_id": "RULE-ECON-LOW-ALTITUDE-01", "rule_statement": "低空经济催生多元化飞行体验与配送消费场景，培育新兴消费市场以满足多样化需求。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "③", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "“彻底缓解”表述过于绝对化；当前低空交通运力与航线密度尚处于起步探索阶段，无法完全替代或彻底解决城市地面交通拥堵。", "source_ref": src(8, 3, 7, 3, "第10题陈述③", "第10题解析"), "rule_id": "RULE-ECON-LOW-ALTITUDE-02", "rule_statement": "低空经济有助于优化通勤效率，但当前发展阶段绝不能表述为「彻底缓解」地面交通压力（绝对化表述错误）。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "④", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "低空经济融合了电动航空、智能网联、轻量化材料与数字空管，是典型的高技术、高效能战略性新兴产业，加速催生新质生产力。", "source_ref": src(8, 3, 7, 3, "第10题陈述④", "第10题解析"), "rule_id": "RULE-ECON-LOW-ALTITUDE-01", "rule_statement": "低空经济作为融合多学科前沿技术的战略性新兴产业，带动产业链升级并催生新质生产力。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        23015: {
            "stem_polarity": "选错误",
            "items": [
                {"key": "A", "statement": "任何法律、法规都不得与宪法相抵触", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "宪法具有最高法律效力，法律法规不得与宪法相抵触。", "source_ref": src(3, 3, 3, 10, "第15题A项", "第15题解析"), "rule_id": "RULE-LAW-CONSTITUTION-SUPREMACY-01", "rule_statement": "法律、行政法规和地方性法规不得同宪法相抵触。", "knowledge_id": 20001, "knowledge_gap": False},
                {"key": "B", "statement": "宪法由全国人民代表大会及其常务委员会制定", "statement_truth": False, "matches_stem": True, "verdict": "入选", "basis": "制宪机关是全国人民代表大会；全国人大常委会负责解释宪法、监督宪法实施，并非共同制宪机关。", "source_ref": src(3, 3, 3, 10, "第15题B项", "第15题解析"), "rule_id": "RULE-LAW-CONSTITUTION-MAKER-01", "rule_statement": "我国宪法由全国人民代表大会制定；全国人大常委会解释宪法并监督宪法实施。", "knowledge_id": 20001, "knowledge_gap": False},
                {"key": "C", "statement": "我国现行宪法一共有五个修正案", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "截至该题资料时点，现行宪法共通过五个修正案，C表述成立。", "source_ref": src(3, 3, 3, 10, "第15题C项", "第15题解析"), "rule_id": "RULE-LAW-CONSTITUTION-AMENDMENT-01", "rule_statement": "我国现行宪法已通过五个修正案。", "knowledge_id": 20001, "knowledge_gap": False},
                {"key": "D", "statement": "宪法对我国国旗、国歌、国徽、首都均作出明确规定", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "宪法规定了国家标志和首都，D项表述成立。", "source_ref": src(3, 3, 3, 10, "第15题D项", "第15题解析"), "rule_id": "RULE-LAW-CONSTITUTION-CONTENT-01", "rule_statement": "宪法规定国家根本制度、国家机构以及国旗、国歌、国徽和首都等事项。", "knowledge_id": 20001, "knowledge_gap": False},
            ],
        },
        24012: {
            "stem_polarity": "选正确",
            "items": [
                {"key": "A", "statement": "国务院", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "宪法修改权由全国人民代表大会行使，不属于国务院。", "source_ref": src(5, 3, 5, 18, "第12题A项", "第12题解析"), "rule_id": "RULE-LAW-CONSTITUTION-AMENDMENT-01", "rule_statement": "全国人民代表大会行使修改宪法的职权。", "knowledge_id": 20002, "knowledge_gap": False},
                {"key": "B", "statement": "省、自治区、直辖市人大及其常委会", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "地方人大及其常委会无权修改国家宪法。", "source_ref": src(5, 3, 5, 18, "第12题B项", "第12题解析"), "rule_id": "RULE-LAW-CONSTITUTION-AMENDMENT-01", "rule_statement": "全国人民代表大会行使修改宪法的职权。", "knowledge_id": 20002, "knowledge_gap": False},
                {"key": "C", "statement": "全国人民代表大会常务委员会", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "全国人大常委会有权提出修宪议案，但宪法修改权属于全国人民代表大会。", "source_ref": src(5, 3, 5, 18, "第12题C项", "第12题解析"), "rule_id": "RULE-LAW-CONSTITUTION-AMENDMENT-01", "rule_statement": "全国人大常委会可提出修宪议案，宪法修改由全国人民代表大会行使。", "knowledge_id": 20002, "knowledge_gap": False},
                {"key": "D", "statement": "全国人民代表大会", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "宪法第六十二条规定，全国人民代表大会行使修改宪法的职权。", "source_ref": src(5, 3, 5, 18, "第12题D项", "第12题解析"), "rule_id": "RULE-LAW-CONSTITUTION-AMENDMENT-01", "rule_statement": "全国人民代表大会行使修改宪法的职权。", "knowledge_id": 20002, "knowledge_gap": False},
            ],
        },
        13: {
            "stem_polarity": "选正确",
            "combination_map": {"A": ["②", "③"], "B": ["①", "④"], "C": ["①", "②", "③", "④"], "D": ["②", "③", "④"]},
            "items": [
                {"key": "①", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "全国人大常委会审议《生态环境法典（草案）》行使的是国家立法权，而非决定权。", "source_ref": src(8, 3, 7, 4, "第13题陈述①", "第13题解析第1句"), "rule_id": "RULE-LAW-NPC-LEGISLATION-02", "rule_statement": "制定、修改和审议法律草案属于全国人大及其常委会的立法权，不能与决定权混淆。", "knowledge_id": 20003, "knowledge_gap": False},
                {"key": "②", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "党的二十届三中全会提出编纂生态环境法典，体现党领导立法、推进国家建设法治化、规范化。", "source_ref": src(8, 3, 7, 4, "第13题陈述②", "第13题解析第2句"), "rule_id": "RULE-POL-PARTY-LAW-01", "rule_statement": "全面依法治国坚持党领导立法，重大立法部署由党中央提出并经法定程序转化为国家意志。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "③", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "编纂生态环境法典是贯彻习近平生态文明思想、全面贯彻落实生态文明建设的必然要求。", "source_ref": src(8, 3, 7, 4, "第13题陈述③", "第13题解析第3句"), "rule_id": "RULE-POL-ECO-CIV-01", "rule_statement": "生态环境法典编纂是推进生态文明建设制度化、法治化的重要举措。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "④", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "十四届全国人大常委会首次审议法典草案，坚持科学立法、民主立法，不断提高立法质量。", "source_ref": src(8, 3, 7, 4, "第13题陈述④", "第13题解析第4句"), "rule_id": "RULE-LAW-SCIENTIFIC-LEG-01", "rule_statement": "全国人大常委会审议法律草案过程坚持科学立法、民主立法以提高立法质量。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        14: {
            "stem_polarity": "选正确",
            "items": [
                {"key": "A", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "监督权是公民的合法权利，并非公民的法定义务，A将权利与义务混为一谈。", "source_ref": src(8, 3, 7, 4, "第14题A项", "第14题解析"), "rule_id": "RULE-LAW-RIGHT-DUTY-01", "rule_statement": "监督权属于公民政治权利，不能写成公民义务。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "B", "statement_truth": None, "matches_stem": None, "verdict": "存疑", "basis": "原卷参考答案选B，认为业主可依法批评物业，但呼吁拒缴物业费超出权利边界。", "dispute_note": "仅凭“呼吁拒缴”不能直接断言构成名誉侵权，仍须核对言论是否失实及相关事实；保留资料答案B供对照，暂不计掌握。", "source_ref": src(8, 3, 7, 4, "第14题B项", "第14题解析"), "rule_id": "RULE-LAW-PROPERTY-DISPUTE-01", "rule_statement": "业主批评物业与呼吁拒缴是否构成名誉侵权，需结合事实是否失实及损害后果综合认定。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "C", "statement_truth": None, "matches_stem": None, "verdict": "存疑", "basis": "物业擅自改建绿地确属侵权，但业主煽动拒缴物业费是否合法存在程序边界争议。", "dispute_note": "维权方式需依法依约进行，不能因对方违约在先即当然豁免全部后续行为边界。", "source_ref": src(8, 3, 7, 4, "第14题C项", "第14题解析"), "rule_id": "RULE-LAW-PROPERTY-DISPUTE-01", "rule_statement": "履行缴费义务与依法维权应分别处理，但维权言行仍受法律边界约束。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "D", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "D将依法行使监督权附加以缴纳物业费为前提，混淆了不同的法律关系。", "source_ref": src(8, 3, 7, 4, "第14题D项", "第14题解析"), "rule_id": "RULE-LAW-RIGHT-DUTY-02", "rule_statement": "履行物业缴费义务与业主依法行使监督权属于不同法律关系，不能互为前置条件。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        16: {
            "stem_polarity": "选正确",
            "combination_map": {"A": ["①", "②"], "B": ["③", "④"], "C": ["①", "④"], "D": ["①", "②", "④"]},
            "items": [
                {"key": "①", "statement_truth": None, "matches_stem": None, "verdict": "存疑", "basis": "题干仅交代父母全额出资且登记在吴某名下，未说明是否存在明确赠与一方的约定。", "dispute_note": "资料参考答案按①成立给C，但最高法院婚姻家庭编解释（二）明确：是否仅赠与一方须看约定，约定不明时离婚分割还应综合考虑补偿，故现有题干不足以唯一确定①成立。", "source_ref": src(8, 4, 7, 5, "第16题陈述①", "第16题解析", "https://www.court.gov.cn/zixun/xiangqing/452751.html"), "rule_id": "RULE-LAW-MARRIAGE-GIFT-01", "rule_statement": "婚后父母全额出资购房并登记在自己子女名下，有明确约定的从约定；约定不明时不能简单推定为当然个人财产。", "knowledge_id": 10038, "knowledge_gap": False},
                {"key": "②", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "不动产物权变动原则上经依法登记发生效力，仅签订《不动产赠与合同》尚未办理转移登记时不能取得所有权。", "source_ref": src(8, 4, 7, 5, "第16题陈述②", "第16题解析"), "rule_id": "RULE-LAW-REAL-PROPERTY-REG-01", "rule_statement": "不动产物权的设立、变更、转让和消灭，经依法登记发生效力。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "③", "statement_truth": None, "matches_stem": None, "verdict": "存疑", "basis": "是否属于夫妻共同财产及赠与是否无效，取决于父母出资时的赠与约定与具体补偿情形。", "dispute_note": "题干缺少父母出资约定事实，③直接断言“属于夫妻共同财产、赠与无效”同样依据不足。", "source_ref": src(8, 4, 7, 5, "第16题陈述③", "第16题解析", "https://www.court.gov.cn/zixun/xiangqing/452751.html"), "rule_id": "RULE-LAW-MARRIAGE-GIFT-01", "rule_statement": "婚后父母出资房产归属需结合赠与约定判断，不能仅凭婚姻存续期间一概认定。", "knowledge_id": 10038, "knowledge_gap": False},
                {"key": "④", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "根据民事诉讼法，当事人不服地方人民法院第一审判决的，有权在判决书送达之日起15日内向上一级人民法院提起上诉。", "source_ref": src(8, 4, 7, 5, "第16题陈述④", "第16题解析"), "rule_id": "RULE-LAW-CIVPRO-APPEAL-01", "rule_statement": "民事一审判决的上诉期限为收到判决书之日起15日内。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        17: {
            "stem_polarity": "选正确",
            "items": [
                {"key": "A", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "平级或不相隶属机关之间行文方向为平行文，商洽、询答和请求批准等主要使用函。", "source_ref": src(8, 4, 7, 5, "第17题A项", "第17题解析"), "rule_id": "RULE-DOC-LETTER-01", "rule_statement": "平级或不相隶属机关之间商洽工作、询问和答复问题、请求批准和答复审批事项，主要使用平行文「函」。", "knowledge_id": 20070, "knowledge_gap": False},
                {"key": "B", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "报告属于上行文，用于向有隶属关系的上级机关汇报工作、反映情况。", "source_ref": src(8, 4, 7, 5, "第17题B项", "第17题解析"), "rule_id": "RULE-DOC-REPORT-01", "rule_statement": "报告适用于向上级机关汇报工作、反映情况，属于上行文。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "C", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "意见可用于上行、下行或平行，但不是平级/不相隶属机关间最主要的正式沟通文种。", "source_ref": src(8, 4, 7, 5, "第17题C项", "第17题解析"), "rule_id": "RULE-DOC-LETTER-01", "rule_statement": "不相隶属机关之间最主要的正式沟通文种是函，而非意见。", "knowledge_id": 20070, "knowledge_gap": False},
                {"key": "D", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "通知一般用于发布、传达要求下级机关执行和有关单位周知或者执行的事项，不属上行文。", "source_ref": src(8, 4, 7, 5, "第17题D项", "第17题解析"), "rule_id": "RULE-DOC-NOTICE-01", "rule_statement": "通知主要用于下行或平行知照事项，并非上行文。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        18: {
            "stem_polarity": "选错误",
            "items": [
                {"key": "A", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "会议纪要确实要求程序清楚、目的明确、中心突出、层次分明，该项陈述成立。", "source_ref": src(8, 4, 7, 5, "第18题A项", "第18题解析"), "rule_id": "RULE-DOC-MINUTES-01", "rule_statement": "会议纪要适用于记载会议主要情况和议定事项，要求中心突出、层次分明。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "B", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "办公会议纪要主要用于记载和传达领导办公会议的决定和决议事项，陈述成立。", "source_ref": src(8, 4, 7, 5, "第18题B项", "第18题解析"), "rule_id": "RULE-DOC-MINUTES-01", "rule_statement": "办公会议纪要用于记载和传达会议决定和决议事项。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "C", "statement_truth": True, "matches_stem": False, "verdict": "排除", "basis": "会议纪要的成文时间可置于标题下方，也可置于正文右下方主办单位下面，陈述成立。", "source_ref": src(8, 4, 7, 5, "第18题C项", "第18题解析"), "rule_id": "RULE-DOC-MINUTES-02", "rule_statement": "纪要成文时间位置较为灵活，可置于标题下方或正文右下方。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "D", "statement_truth": False, "matches_stem": True, "verdict": "入选", "basis": "纪要提炼会议主要情况和议定事项，无须原词原句记录全部发言；D混淆了「会议纪要」与「会议记录」，符合“错误的是”设问。", "source_ref": src(8, 4, 7, 5, "第18题D项", "第18题解析"), "rule_id": "RULE-DOC-MINUTES-VS-RECORD-01", "rule_statement": "会议纪要提炼主要情况和议定事项，不要求原词原句记录发言；原词记录属于会议记录。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        26: {
            "stem_polarity": "选正确",
            "items": [
                {"key": "A", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "基层治理中的领导核心作用由党组织发挥，A将领导核心错误归于人民代表大会。", "source_ref": src(8, 6, 7, 6, "第26题A项", "第26题解析"), "rule_id": "RULE-POL-GRASSROOTS-CORE-01", "rule_statement": "基层治理中发挥领导核心作用的是基层党组织，而非人大。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "B", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "人大代表常态化下沉网格“面对面”“零距离”收集社情民意，健全了联系群众机制、畅通表达渠道。", "source_ref": src(8, 6, 7, 6, "第26题B项", "第26题解析"), "rule_id": "RULE-POL-NPC-DEPUTY-01", "rule_statement": "人大代表密切联系群众机制有助于畅通社情民意表达渠道。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "C", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "材料未体现人大代表行使提案权，且“最优途径”表述绝对化。", "source_ref": src(8, 6, 7, 6, "第26题C项", "第26题解析"), "rule_id": "RULE-POL-NPC-DEPUTY-02", "rule_statement": "代表联系群众属于履职服务，不等同于行使提案权，且不宜绝对化称为“最优途径”。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "D", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "创新建立代表履职“积分制”并与乡村治理结合，丰富了选民联系形式，激发履职动能。", "source_ref": src(8, 6, 7, 6, "第26题D项", "第26题解析"), "rule_id": "RULE-POL-NPC-DEPUTY-01", "rule_statement": "创新代表联系选民形式有利于推动人大代表更好履职尽责。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        35: {
            "stem_polarity": "判断正误",
            "items": [
                {"key": "判断", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "题干将市场与政府的作用倒置。规范表述为使市场在资源配置中起决定性作用，更好发挥政府作用，故判错（选D）。", "source_ref": src(8, 7, 7, 8, "第35题题干", "第35题解析"), "rule_id": "RULE-ECON-MARKET-GOV-01", "rule_statement": "市场在资源配置中起决定性作用，更好发挥政府作用。", "knowledge_id": None, "knowledge_gap": True},
            ],
        },
        41: {
            "stem_polarity": "判断正误",
            "items": [
                {"key": "判断", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "报告中不得夹带请示事项。教育工作报告用于汇报情况，申请专项资金应另行使用请示，故判错（选D）。", "source_ref": src(8, 7, 7, 9, "第41题题干", "第41题解析"), "rule_id": "RULE-DOC-REPORT-NO-REQUEST-01", "rule_statement": "请示应当一文一事，不得在报告等非请示性公文中夹带请示事项。", "knowledge_id": 20071, "knowledge_gap": False},
            ],
        },
        24107: {
            "stem_polarity": "判断正误",
            "items": [
                {"key": "判断", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "根据宪法规定，全国人民代表大会和全国人民代表大会常务委员会行使国家立法权，题干表述正确（选A）。", "source_ref": src(6, 1, 6, 12, "第7题题干", "第7题解析"), "rule_id": "RULE-LAW-NPC-LEGISLATION-01", "rule_statement": "全国人民代表大会和全国人民代表大会常务委员会行使国家立法权。", "knowledge_id": 20003, "knowledge_gap": False},
            ],
        },
        19025: {
            "stem_polarity": "选正确",
            "items": [
                {"key": "A", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "请示用于向有隶属关系的上级机关请求指示、批准；公安局与市高级中学无隶属关系。", "source_ref": src(1, 3, 2, 2, "第25题A项", "第25题解析"), "rule_id": "RULE-DOC-REQUEST-01", "rule_statement": "请示仅适用于有上下级隶属关系的机关。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "B", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "通知用于发布、传达要求执行或周知的事项，不适用于向不相隶属单位商洽借用场馆。", "source_ref": src(1, 3, 2, 2, "第25题B项", "第25题解析"), "rule_id": "RULE-DOC-NOTICE-01", "rule_statement": "通知不用于平级或不相隶属机关之间的商洽借用请求。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "C", "statement_truth": False, "matches_stem": False, "verdict": "排除", "basis": "“申请”不属于《党政机关公文处理工作条例》规定的15种法定公文文种。", "source_ref": src(1, 3, 2, 2, "第25题C项", "第25题解析"), "rule_id": "RULE-DOC-STATUTORY-TYPES-01", "rule_statement": "法定党政公文共15种，不含“申请”。", "knowledge_id": None, "knowledge_gap": True},
                {"key": "D", "statement_truth": True, "matches_stem": True, "verdict": "入选", "basis": "市公安局与市高级中学之间没有上下级隶属关系，借用体育馆属于商洽事项，应使用函。", "source_ref": src(1, 3, 2, 2, "第25题D项", "第25题解析"), "rule_id": "RULE-DOC-LETTER-01", "rule_statement": "平级或不相隶属机关之间商洽工作、询问和答复问题、请求批准和答复审批事项，主要使用平行文「函」。", "knowledge_id": 20070, "knowledge_gap": False},
            ],
        },
    }
    statements = {
        1: {"A": "坚持求同存异", "B": "坚持互利共赢", "C": "坚持独立自主", "D": "坚持公平正义"},
        2: {"①": "严格执法，坚决纠正不作为、乱作为", "②": "规范执法，过程、结果公开透明", "③": "树立正确政绩观，切实改正工作作风", "④": "树立重实干、重实绩的用人导向"},
        3: {"①": "坚持中国共产党的领导，走中国特色社会主义道路", "②": "坚持和完善民族区域自治制度，保障民族平等权利", "③": "全国各族人民共同奋斗，形成团结互助的民族关系", "④": "全面建成社会主义现代化强国，为西藏全面发展奠定了基础"},
        4: {"A": "体现出国家把促进协调发展作为中心工作", "B": "彰显了两岸科技创新与协同发展的引擎效应", "C": "表明我国把增强中华民族共同体意识落实到实处", "D": "是不断丰富“一国两制”生动实践的成果"},
        5: {"A": "民主决策", "B": "民主协商", "C": "民主管理", "D": "民主监督"},
        6: {"A": "认识具有反复性，正确认识需要经过多次反复才能完成", "B": "价值判断与价值选择具有主体差异性的特征", "C": "社会存在决定社会意识，社会存在变化决定社会意识变化", "D": "实践具有社会历史性，不同时代人们的实践方式不同"},
        7: {"①": "创新是引领发展的第一动力", "②": "辩证的否定是事物发展的环节", "③": "上层建筑决定经济基础的发展", "④": "要坚持两点论和重点论的统一"},
        8: {"A": "人的劳动能力是生产水平的标志，也是最活跃的主导因素", "B": "生产力发展水平决定生产关系的性质，生产力变化最终导致生产关系变革", "C": "“封建土地制阻碍工业资本扩张”体现了生产关系对生产力的反作用", "D": "新质生产力是由技术革命性突破、生产要素创新性配置、产业深度转型升级催生"},
        9: {"A": "中央银行降低再贷款利率", "B": "提高法定存款准备金率", "C": "发行央行票据回笼货币", "D": "上调金融机构存贷比基准利率"},
        10: {"①": "完善立体交通网络，提升区域互联互通水平", "②": "培育新兴消费市场，满足多样化出行需求", "③": "彻底缓解地面交通压力，优化城市通勤效率", "④": "带动技术创新和产业升级，形成新质生产力"},
        13: {"①": "全国人大常委会行使决定权，为保护生态环境提供法律保障。", "②": "中国共产党领导立法，推进国家建设的法治化、规范化。", "③": "编纂生态环境法典是全面贯彻落实生态文明建设的必然要求。", "④": "全国人大常委会坚持科学立法、民主立法，不断提高立法质量。"},
        18: {"A": "会议纪要程序要清楚、目的要明确、中心要突出、层次分明。", "B": "办公会议纪要主要用于传达领导办公会议的决定和决议。", "C": "会议纪要的成文时间一般写在标题之下，正文右下方。", "D": "会议纪要是会议实录，需对全部发言进行原词原句记录。"},
        26: {"A": "人大代表是基层治理的领导核心。", "B": "人大代表联系群众机制畅通社情民意表达渠道。", "C": "人大代表联系群众是行使提案权的最优途径。", "D": "代表履职积分制丰富了选民联系形式。"},
        19025: {"A": "请示", "B": "通知", "C": "申请", "D": "函"},
        23015: {"A": "任何法律、法规都不得与宪法相抵触", "B": "宪法由全国人民代表大会及其常务委员会制定", "C": "我国现行宪法一共有五个修正案", "D": "宪法对我国国旗、国歌、国徽、首都均作出明确规定"},
        24012: {"A": "国务院", "B": "省、自治区、直辖市人大及其常委会", "C": "全国人民代表大会常务委员会", "D": "全国人民代表大会"},
    }
    for qid, items in statements.items():
        for item in overrides[qid]["items"]:
            item["statement"] = items[item["key"]]
    return overrides


def main() -> None:
    if not OUT_JSON.exists():
        raise FileNotFoundError(f"Existing breakdown file {OUT_JSON} not found. Halting to avoid overwriting unverified baselines.")
    try:
        baseline_content = json.loads(OUT_JSON.read_text(encoding="utf-8"))
        baseline_by_id = {b["question_id"]: b for b in baseline_content.get("breakdowns", [])}
    except Exception as e:
        raise RuntimeError(f"Failed to read existing baseline from {OUT_JSON}: {e}. Halting.")

    if len(baseline_by_id) != 345:
        raise RuntimeError(f"Existing baseline has {len(baseline_by_id)} questions, expected 345. Halting.")

    cat = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    materials = {m["id"]: m["name"] for m in cat["materials"]}

    curated = hand_curated_overrides(materials)
    # 本批明确限定第1—10题；若通过命令行参数传入题号则支持指定更新，其余题目均受执行前磁盘基线保护
    if len(sys.argv) > 1 and all(arg.isdigit() for arg in sys.argv[1:]):
        TARGET_QUESTION_IDS = {int(arg) for arg in sys.argv[1:]}
    else:
        TARGET_QUESTION_IDS = set(range(1, 11))
    breakdowns: list[dict] = []

    for q in cat["questions"]:
        qid = q["id"]
        if qid in TARGET_QUESTION_IDS:
            ov = curated[qid]
            entry = {
                "question_id": qid,
                "version": q["version"],
                "exam": q["exam"],
                "number": q["number"],
                "type": q["type"],
                "status": q["status"],
                "stem_polarity": ov["stem_polarity"],
                **({"combination_map": ov["combination_map"]} if "combination_map" in ov else {}),
                "items": ov["items"],
            }
            for item in entry["items"]:
                if "statement" not in item:
                    item["statement"] = q["body"].strip()
            entry["status"] = q["status"]
            breakdowns.append(entry)
        else:
            if qid not in baseline_by_id:
                raise RuntimeError(f"Question {qid} missing from baseline! Halting.")
            breakdowns.append(baseline_by_id[qid])

    # Invariance check: verify all non-target questions remain strictly identical to execution baseline
    new_by_id = {b["question_id"]: b for b in breakdowns}
    for qid, old_b in baseline_by_id.items():
        if qid not in TARGET_QUESTION_IDS:
            assert new_by_id[qid] == old_b, f"Non-target question {qid} was modified unexpectedly!"

    OUT_JSON.write_text(
        json.dumps({"version": cat["version"], "count": len(breakdowns), "breakdowns": breakdowns}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Generate Markdown report grouped by exam
    by_exam: dict[str, list[dict]] = {e: [] for e in EXAM_ORDER}
    for b in breakdowns:
        by_exam.setdefault(b["exam"], []).append(b)

    lines: list[str] = [
        "# 345 道历年真题逐项解析依据清单与核对统计",
        "",
        f"共处理历年真题 **{len(breakdowns)} 道**（按 7 套试卷分卷推进；2025 年上午卷含 12 道定标样板 + 其余 33 道作为全量第一批）。",
        "仅状态为“已核对”的逐项依据可直接用于复习；待核对及争议题均为资料摘录，答题页继续展示原解析。",
        "",
        "## 一、全库核对状态总览（用于区分可直接作为复习依据的题目）",
        "",
        "| 试卷 | 总题数 | 已核对（可直接作复习依据） | 待核对（需逐页复核PDF） | 争议（仅供对照，不计掌握） | 知识卡缺口题数 |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]

    total_verified = 0
    total_pending = 0
    total_disputed = 0
    total_gap = 0

    for exam in EXAM_ORDER:
        qs = by_exam.get(exam, [])
        v = [x for x in qs if x["status"] == "已核对"]
        p = [x for x in qs if x["status"] == "待核对"]
        d = [x for x in qs if x["status"] == "争议"]
        g = [x for x in qs if all(item.get("knowledge_gap") for item in x["items"])]
        total_verified += len(v)
        total_pending += len(p)
        total_disputed += len(d)
        total_gap += len(g)
        lines.append(f"| {exam} | {len(qs)} | {len(v)} | {len(p)} | {len(d)} | {len(g)} |")

    lines.append(f"| **合计** | **{len(breakdowns)}** | **{total_verified}** | **{total_pending}** | **{total_disputed}** | **{total_gap}** |")
    lines.append("")

    for exam in EXAM_ORDER:
        qs = sorted(by_exam.get(exam, []), key=lambda x: x["number"])
        v_nums = [f"第{x['number']}题(`{x['question_id']}`)" for x in qs if x["status"] == "已核对"]
        p_nums = [f"第{x['number']}题" for x in qs if x["status"] == "待核对"]
        d_items = [x for x in qs if x["status"] == "争议"]

        lines.append(f"## 二、{exam}（{len(qs)} 题）")
        lines.append("")
        lines.append(f"- **已核对（可直接作为复习依据，{len(v_nums)} 题）**：{'、'.join(v_nums) if v_nums else '暂无'}")
        lines.append(f"- **待核对（{len(p_nums)} 题）**：{'、'.join(p_nums) if p_nums else '无'}")
        if d_items:
            d_desc = "；".join(
                f"第{x['number']}题(`{x['question_id']}`): {next((i.get('dispute_note') or i['basis'] for i in x['items'] if i.get('dispute_note') or i['verdict'] == '存疑'), '存在争议')}"
                for x in d_items
            )
            lines.append(f"- **争议题（{len(d_items)} 题，已标存疑并隔离统计）**：{d_desc}")
        else:
            lines.append("- **争议题（0 题）**：无")
        lines.append("")
        lines.append("| 题号 | ID | 版本 | 题型 | 设问极性 | 状态 | 覆盖项 | 知识卡/缺口 | 原题页 / 原解析页 |")
        lines.append("| ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |")
        for x in qs:
            keys_str = "、".join(i["key"] for i in x["items"])
            kids = sorted({i["knowledge_id"] for i in x["items"] if i["knowledge_id"] is not None})
            k_str = ", ".join(f"`{k}`" for k in kids) if kids else "缺口"
            sr = x["items"][0]["source_ref"]
            pg_str = f"p.{sr['question_material']['page']} / p.{sr['analysis_material']['page']}"
            lines.append(
                f"| 第{x['number']}题 | `{x['question_id']}` | v{x['version']} | {x['type']} | {x['stem_polarity']} | {x['status']} | {keys_str} | {k_str} | {pg_str} |"
            )
        lines.append("")

    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated {OUT_JSON} ({len(breakdowns)} questions) and {OUT_MD}")


if __name__ == "__main__":
    main()
