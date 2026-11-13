/**
 * The learner event schema (schemas/learner-event.schema.json) as a validator, set up as the API
 * sets it up to check uploads (apps/api/src/log.ts), so a restored file is held to the same rules.
 * Imported only when a file is restored: Ajv stays out of the app's first load.
 */
import type { LearnerEvent } from "@nabu/schema";
import { Ajv2020 } from "ajv/dist/2020.js";
import common from "../../../schemas/common.schema.json" with { type: "json" };
import correction from "../../../schemas/correction.schema.json" with { type: "json" };
import learnerEvent from "../../../schemas/learner-event.schema.json" with { type: "json" };

const ajv = new Ajv2020({ strict: true, allErrors: false });
// Annotation read by json-schema-to-typescript; meaningless to validators.
ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
ajv.addSchema(common);
ajv.addSchema(correction);
const validate = ajv.compile<LearnerEvent>(learnerEvent);

/** Whether a value is a valid learner event. */
export const validEvent = (value: unknown): value is LearnerEvent => validate(value);
