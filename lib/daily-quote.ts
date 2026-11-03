export const dailyQuotes = [
  {text:'天行健，君子以自强不息。',author:'',source:'周易·乾'},
  {text:'学而时习之，不亦说乎？',author:'',source:'论语·学而'},
  {text:'学而不思则罔，思而不学则殆。',author:'',source:'论语·为政'},
  {text:'知之者不如好之者，好之者不如乐之者。',author:'',source:'论语·雍也'},
  {text:'君子欲讷于言而敏于行。',author:'',source:'论语·里仁'},
  {text:'不积跬步，无以至千里。',author:'荀子',source:'劝学'},
  {text:'锲而不舍，金石可镂。',author:'荀子',source:'劝学'},
  {text:'苟日新，日日新，又日新。',author:'',source:'礼记·大学'},
  {text:'博学之，审问之，慎思之，明辨之，笃行之。',author:'',source:'礼记·中庸'},
  {text:'千里之行，始于足下。',author:'',source:'老子·第六十四章'},
  {text:'胜人者有力，自胜者强。',author:'',source:'老子·第三十三章'},
  {text:'生于忧患，死于安乐。',author:'',source:'孟子·告子下'},
  {text:'尽信书，则不如无书。',author:'',source:'孟子·尽心下'},
  {text:'志不强者智不达。',author:'',source:'墨子·修身'},
  {text:'业精于勤，荒于嬉；行成于思，毁于随。',author:'韩愈',source:'进学解'},
  {text:'博观而约取，厚积而薄发。',author:'苏轼',source:'稼说送张琥'},
  {text:'穷且益坚，不坠青云之志。',author:'王勃',source:'滕王阁序'},
  {text:'路漫漫其修远兮，吾将上下而求索。',author:'屈原',source:'离骚'},
  {text:'老骥伏枥，志在千里；烈士暮年，壮心不已。',author:'曹操',source:'龟虽寿'},
  {text:'长风破浪会有时，直挂云帆济沧海。',author:'李白',source:'行路难·其一'},
  {text:'天生我材必有用，千金散尽还复来。',author:'李白',source:'将进酒'},
  {text:'大鹏一日同风起，扶摇直上九万里。',author:'李白',source:'上李邕'},
  {text:'会当凌绝顶，一览众山小。',author:'杜甫',source:'望岳'},
  {text:'不畏浮云遮望眼，自缘身在最高层。',author:'王安石',source:'登飞来峰'},
  {text:'千磨万击还坚劲，任尔东西南北风。',author:'郑燮',source:'竹石'},
  {text:'纸上得来终觉浅，绝知此事要躬行。',author:'陆游',source:'冬夜读书示子聿'},
  {text:'山重水复疑无路，柳暗花明又一村。',author:'陆游',source:'游山西村'},
  {text:'沉舟侧畔千帆过，病树前头万木春。',author:'刘禹锡',source:'酬乐天扬州初逢席上见赠'},
  {text:'欲穷千里目，更上一层楼。',author:'王之涣',source:'登鹳雀楼'},
  {text:'莫听穿林打叶声，何妨吟啸且徐行。',author:'苏轼',source:'定风波·莫听穿林打叶声'},
  {text:'人间有味是清欢。',author:'苏轼',source:'浣溪沙·细雨斜风作晓寒'},
] as const;

export function dailyQuote(now = new Date()) {
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(now);
  const day=(Date.parse(date)-Date.UTC(2026,10,3))/86400000;
  // shortcut: 31句按日期循环，需要更长周期不重复时扩充精选句库。
  return {date,...dailyQuotes[((day%dailyQuotes.length)+dailyQuotes.length)%dailyQuotes.length]};
}
