import "server-only";
import { normalizeHomeDoc, type HomeDoc } from "./home-sections";
import * as P from "./doc-plans";

/** Σενάρια, έγκριση, ιστορικό και σύνδεσμος προεπισκόπησης της αρχικής (CmsDocument «home.layout»/«home» · «plans»). */
export const HOME_TARGET: P.PlanTarget<HomeDoc> = {
  collection: "home.layout", key: "home", plansCollection: "home.layout", plansKey: "plans",
  publishAction: "cms.home.publish", entityId: "home.layout/home", normalize: normalizeHomeDoc, scope: "home",
};

export type HomeScenario = P.Scenario<HomeDoc>;
export type HomeReview = P.Review;
export type HomePublish = P.PublishEntry<HomeDoc>;
export const getPlans = () => P.getPlans(HOME_TARGET);
export const updatePlans = (by: string, fn: (p: P.Plans<HomeDoc>) => P.Plans<HomeDoc>) => P.updatePlans(HOME_TARGET, by, fn);
export const newScenario = (name: string, doc: HomeDoc, by: string, byName: string, publishAt: string | null = null) => P.newScenario(HOME_TARGET, name, doc, by, byName, publishAt);
export const runDueScenarios = (opts: { force?: boolean } = {}) => P.runDueScenarios(HOME_TARGET, opts);
export const publishHistory = (limit = 30) => P.publishHistory(HOME_TARGET, limit);
export const previewToken = (days = 7) => P.previewToken("home", days);
export const previewTokenOk = (t: unknown) => P.previewTokenOk(t, "home");
