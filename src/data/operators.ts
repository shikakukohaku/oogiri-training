import type { OperatorDef, OperatorId } from '../types';

export const OPERATORS: OperatorDef[] = [
  {
    id: 'reverse',
    label: '逆転',
    hint: '普通と逆にする。',
    example: '起こす → 寝かしつける',
    needs: 1,
  },
  {
    id: 'exaggerate',
    label: '過剰化',
    hint: '100倍にする。',
    example: 'アラームがうるさい → 町内全員が起きる',
    needs: 1,
  },
  {
    id: 'minimize',
    label: '矮小化',
    hint: '壮大なものをショボくする。',
    example: '世界を救うヒーロー → 町内会だけ守る',
    needs: 1,
  },
  {
    id: 'personify',
    label: '擬人化',
    hint: 'モノを人間のように扱う。',
    example: 'スヌーズ → 「今日は寝ててもいいよ」と励ましてくる',
    needs: 1,
  },
  {
    id: 'perspective',
    label: '視点変更',
    hint: '別の立場から見る。',
    example: 'コンビニ → 客ではなく店員から見る',
    needs: 1,
  },
  {
    id: 'crossIndustry',
    label: '異業種化',
    hint: '別ジャンルの仕組みを持ち込む。',
    example: '動物園 + スポーツビジネス → スポンサー広告',
    needs: 1,
  },
  {
    id: 'literal',
    label: '文字通り化',
    hint: '比喩や慣用句を本当に起こす。',
    example: '寝耳に水 → 耳に水が入って起きる',
    needs: 1,
  },
  {
    id: 'combine',
    label: '組み合わせ',
    hint: '選んだ2つを強引にくっつける。',
    example: 'キリンの長い首 × スポンサー → 首が広告枠',
    needs: 2,
  },
];

export function operatorDef(id: OperatorId): OperatorDef {
  return OPERATORS.find((o) => o.id === id) ?? OPERATORS[0];
}

export function operatorLabel(id: OperatorId): string {
  return operatorDef(id).label;
}
