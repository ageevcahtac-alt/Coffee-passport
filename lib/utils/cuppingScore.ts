import type { SensoryEvaluationValues } from '@/lib/types/coffee';

// Maps the 1-5 sensory read (the guest flavor profile's four axes plus the
// overall cup rating) onto a 60-100, SCA-familiar-looking scale — an
// approachable "how did this cup score" number for a home cupping session
// in Coffee Kitchen, not a stand-in for a formal SCA/CVA cupping protocol.
export function computeCuppingScore(sensory: SensoryEvaluationValues): number {
  const { acidity, sweetness, body, bitterness } = sensory.guestFlavorProfile;
  const average = (acidity + sweetness + body + bitterness + sensory.rating) / 5;
  const score = 60 + ((average - 1) / 4) * 40;
  return Math.round(score * 10) / 10;
}
