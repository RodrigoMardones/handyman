import { redirect } from "next/navigation";

/**
 * `/` is not a page anymore. The marketing landing that lived here (feature
 * toolbox_next_landing) was retired by feature web_exp_revision: a localhost
 * observer has exactly one visitor, its operator, so the panel's home is the
 * fleet view, not a pitch for it. tests/test_toolbox_serve.sh (TS1) pins the
 * redirect and re-asserts the structural security contract (no UMD vendors,
 * no external scripts) against the followed body.
 */
export default function Home() {
  redirect("/fleet");
}
