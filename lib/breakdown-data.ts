import {z} from 'zod';
import data from '../data/question-breakdowns.json' with {type:'json'};
import type {QuestionBreakdown} from './breakdown';

const location=z.object({id:z.number().int(),name:z.string(),page:z.number().int().positive(),location:z.string()});
export const breakdownSchema=z.object({
  question_id:z.number().int().positive(),
  version:z.number().int().positive(),
  exam:z.string(),
  number:z.number().int().positive(),
  type:z.enum(['单选','多选','判断']),
  status:z.enum(['待核对','已核对','争议']),
  stem_polarity:z.enum(['选正确','选错误','判断正误']),
  combination_map:z.record(z.string(),z.array(z.string())).optional(),
  items:z.array(z.object({
    key:z.string(),
    statement_truth:z.boolean().nullable(),
    matches_stem:z.boolean().nullable(),
    verdict:z.enum(['入选','排除','存疑']),
    basis:z.string(),
    statement:z.string().optional(),
    dispute_note:z.string().optional(),
    source_ref:z.object({question_material:location,analysis_material:location,external:z.string().optional()}),
    rule_id:z.string(),
    rule_statement:z.string(),
    knowledge_id:z.number().int().nullable(),
    knowledge_gap:z.boolean().optional(),
  })).min(1),
});

const available=new Map<string,QuestionBreakdown>();
for(const item of data.breakdowns){
  // Automatically extracted drafts can include the wrong option's evidence.
  if(item.items.length&&item.items.every(evidence=>evidence.rule_id!=='RULE-UNVERIFIED')&&item.status!=='争议'){
    const entry=breakdownSchema.parse(item);
    available.set(entry.question_id+':'+entry.version,entry);
  }
}

export function getQuestionBreakdown(id:number, version:number) {
  return available.get(id+':'+version)??null;
}
