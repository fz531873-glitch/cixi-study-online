export type StemPolarity = '选正确' | '选错误' | '判断正误';
export type ItemVerdict = '入选' | '排除' | '存疑';

export interface SourceLocationRef {
  id: number;
  name: string;
  page: number;
  location: string;
}

export interface BreakdownSourceRef {
  question_material: SourceLocationRef;
  analysis_material: SourceLocationRef;
  external?: string;
}

export interface BreakdownItem {
  key: string;
  statement_truth: boolean | null;
  matches_stem: boolean | null;
  verdict: ItemVerdict;
  basis: string;
  statement?: string;
  dispute_note?: string;
  source_ref: BreakdownSourceRef;
  rule_id: string;
  rule_statement: string;
  knowledge_id: number | null;
  knowledge_gap?: boolean;
}

export interface QuestionBreakdown {
  question_id: number;
  version: number;
  exam: string;
  number: number;
  type: '单选' | '多选' | '判断';
  status: '待核对' | '已核对' | '争议';
  stem_polarity: StemPolarity;
  combination_map?: Record<string, string[]>;
  items: BreakdownItem[];
}

export interface AnswerFeedbackSection {
  title: string;
  items: BreakdownItem[];
}

export interface AnswerFeedback {
  headline: string;
  summary: string;
  sections: AnswerFeedbackSection[];
  disputed: boolean;
}

function expandKeys(breakdown: QuestionBreakdown, answerLetters: string): string[] {
  const letters = [...answerLetters].filter(Boolean);
  if (breakdown.combination_map) {
    const keys: string[] = [];
    for (const letter of letters) {
      for (const k of breakdown.combination_map[letter] ?? [letter]) {
        if (!keys.includes(k)) keys.push(k);
      }
    }
    return keys;
  }
  return letters;
}

export function buildAnswerFeedback(
  breakdown: QuestionBreakdown,
  userAnswer: string,
  correctAnswer: string
): AnswerFeedback {
  const userNorm = [...userAnswer.toUpperCase()].sort().join('');
  const correctNorm = [...correctAnswer.toUpperCase()].sort().join('');

  if (breakdown.status === '争议') {
    const disputedItems = breakdown.items.filter(item => item.verdict === '存疑');
    const otherItems = breakdown.items.filter(item => item.verdict !== '存疑');
    return {
      headline: `本题存在争议（你选了 ${userNorm || '未作答'}，资料参考 ${correctNorm}）`,
      summary: '本题暂不计入掌握统计与复习排期，以下逐项标明存疑点与可成立依据。',
      sections: [
        ...(disputedItems.length ? [{ title: '存疑与分歧点', items: disputedItems }] : []),
        ...(otherItems.length ? [{ title: '其余选项/陈述依据', items: otherItems }] : []),
      ],
      disputed: true,
    };
  }

  if (breakdown.type === '判断') {
    const item=breakdown.items.find(item=>item.key==='判断');
    return {
      headline:userNorm?(userNorm===correctNorm?'回答正确':'判断有误'):'参考判断',
      summary:correctNorm==='A'?'参考答案：正确。':'参考答案：错误。',
      sections:item?[{title:'判断依据',items:[item]}]:[],
      disputed:false,
    };
  }

  const userKeys = expandKeys(breakdown, userNorm);
  const correctKeys = expandKeys(breakdown, correctNorm);
  const missedKeys = correctKeys.filter(k => !userKeys.includes(k));
  const wrongKeys = userKeys.filter(k => !correctKeys.includes(k));
  const matchedKeys = userKeys.filter(k => correctKeys.includes(k));

  const byKey = new Map(breakdown.items.map(item => [item.key, item]));
  const pick = (keys: string[]) => keys.map(k => byKey.get(k)).filter((x): x is BreakdownItem => Boolean(x));

  if (!userNorm || userNorm === correctNorm) {
    const selectedItems = pick(correctKeys);
    const excludedItems = breakdown.items.filter(item => !correctKeys.includes(item.key));
    return {
      headline: userNorm ? `回答正确（${correctNorm}）` : `参考答案 ${correctNorm}`,
      summary:
        breakdown.stem_polarity === '选错误'
          ? '本题为反向设问「选错误的一项」，先确认各陈述真假，再锁定不符合事实的选项。'
          : '关键判断规则已命中，可核对各入选与排除依据。',
      sections: [
        ...(selectedItems.length ? [{ title: '正确入选依据', items: selectedItems }] : []),
        ...(excludedItems.length ? [{ title: '其余排除依据', items: excludedItems }] : []),
      ],
      disputed: false,
    };
  }

  if (breakdown.type === '多选') {
    const wrongItems = pick(wrongKeys);
    const missedItems = pick(missedKeys);
    const matchedItems = pick(matchedKeys);
    const parts: string[] = [];
    if (wrongKeys.length) parts.push(`错选了 ${wrongKeys.join('、')}`);
    if (missedKeys.length) parts.push(`漏选了 ${missedKeys.join('、')}`);
    return {
      headline: `多选偏差：${parts.join('，')}（参考答案 ${correctNorm}）`,
      summary: '先排除误选项，再补全漏选项的入选条件。',
      sections: [
        ...(wrongItems.length ? [{ title: `错选项纠正（${wrongKeys.join('、')}）`, items: wrongItems }] : []),
        ...(missedItems.length ? [{ title: `漏选项补充（${missedKeys.join('、')}）`, items: missedItems }] : []),
        ...(matchedItems.length ? [{ title: `已选对项（${matchedKeys.join('、')}）`, items: matchedItems }] : []),
      ],
      disputed: false,
    };
  }

  if (breakdown.combination_map) {
    const wrongItems = pick(wrongKeys);
    const missedItems = pick(missedKeys);
    const matchedItems = pick(matchedKeys);
    const parts: string[] = [];
    if (wrongKeys.length) parts.push(`错选/多选了 ${wrongKeys.join('')}`);
    if (missedKeys.length) parts.push(`漏选了 ${missedKeys.join('')}`);
    return {
      headline: `组合偏差：${parts.join('，')}（参考答案 ${correctNorm}）`,
      summary:
        wrongKeys.length && missedKeys.length
          ? `优先纠正误选的 ${wrongKeys.join('')}，再确认成立的 ${[...matchedKeys, ...missedKeys].join('')}。`
          : wrongKeys.length
            ? `已识别出 ${matchedKeys.join('')}，唯一偏差在于多选了 ${wrongKeys.join('')}。`
            : `已识别出 ${matchedKeys.join('')}，遗漏了 ${missedKeys.join('')}。`,
      sections: [
        ...(wrongItems.length ? [{ title: `优先纠正误选（${wrongKeys.join('')}）`, items: wrongItems }] : []),
        ...(missedItems.length ? [{ title: `遗漏成立项（${missedKeys.join('')}）`, items: missedItems }] : []),
        ...(matchedItems.length ? [{ title: `已选对项（${matchedKeys.join('')}）`, items: matchedItems }] : []),
      ],
      disputed: false,
    };
  }

  // 单选 / 判断
  const chosenItems = pick(userKeys);
  const rightItems = pick(correctKeys);
  const reverseHint =
    breakdown.stem_polarity === '选错误' && chosenItems.some(item => item.statement_truth === true)
      ? `你选的 ${userNorm} 本身陈述成立，但本题问的是「错误的一项」，因此不符合设问。`
      : `你选的 ${userNorm} 不符合题干设问，正确答案应为 ${correctNorm}。`;

  return {
    headline: `你选了 ${userNorm}，参考答案 ${correctNorm}`,
    summary: reverseHint,
    sections: [
      ...(chosenItems.length ? [{ title: `为什么不选 ${userNorm}`, items: chosenItems }] : []),
      ...(rightItems.length ? [{ title: `为什么应选 ${correctNorm}`, items: rightItems }] : []),
    ],
    disputed: false,
  };
}

export type RuleRelation = 'same_rule' | 'same_card_different_rule' | 'unrelated';

export function classifyRuleRelation(
  a: QuestionBreakdown,
  b: QuestionBreakdown,
  itemKeyA?: string,
  itemKeyB?: string
): { relation: RuleRelation; sharedRuleIds: string[]; sharedKnowledgeIds: number[] } {
  const itemsA = itemKeyA ? a.items.filter(i => i.key === itemKeyA) : a.items;
  const itemsB = itemKeyB ? b.items.filter(i => i.key === itemKeyB) : b.items;

  const rulesA = new Set(itemsA.map(i => i.rule_id).filter(r => r && r !== 'RULE-UNVERIFIED'));
  const rulesB = new Set(itemsB.map(i => i.rule_id).filter(r => r && r !== 'RULE-UNVERIFIED'));
  const sharedRuleIds = [...rulesA].filter(r => rulesB.has(r));

  const cardsA = new Set(itemsA.map(i => i.knowledge_id).filter((id): id is number => id !== null));
  const cardsB = new Set(itemsB.map(i => i.knowledge_id).filter((id): id is number => id !== null));
  const sharedKnowledgeIds = [...cardsA].filter(id => cardsB.has(id));

  if (sharedRuleIds.length > 0) {
    return { relation: 'same_rule', sharedRuleIds, sharedKnowledgeIds };
  }
  if (sharedKnowledgeIds.length > 0) {
    return { relation: 'same_card_different_rule', sharedRuleIds: [], sharedKnowledgeIds };
  }
  return { relation: 'unrelated', sharedRuleIds: [], sharedKnowledgeIds: [] };
}
