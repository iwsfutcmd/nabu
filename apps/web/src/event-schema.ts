/**
 * The learner event schema (schemas/learner-event.next.schema.json) as a validator, set up as the
 * API sets it up to check uploads (apps/api/src/log.ts), so a restored file is held to the same
 * rules; and the schema of before the lexical model, for a file downloaded before the switch,
 * whose events are rewritten as they are read (restore.ts). Imported only when a file is restored:
 * Ajv stays out of the app's first load.
 */
import type { LearnerEvent, LearnerEventV1 } from "@nabu/schema";
import { Ajv2020 } from "ajv/dist/2020.js";
import common from "../../../schemas/common.schema.json" with { type: "json" };
import correction from "../../../schemas/correction.schema.json" with { type: "json" };
import learnerEvent from "../../../schemas/learner-event.next.schema.json" with { type: "json" };
import learnerEventBefore from "../../../schemas/learner-event.schema.json" with { type: "json" };

const ajv = new Ajv2020({ strict: true, allErrors: false });
// Annotation read by json-schema-to-typescript; meaningless to validators.
ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
ajv.addSchema(common);
ajv.addSchema(correction);
// The new shape shares the old one's definitions (ids, a session's summary), so the old goes in first.
const validateBefore = ajv.compile<LearnerEventV1>(learnerEventBefore);
const validate = ajv.compile<LearnerEvent>(learnerEvent);

/** Whether a value is a valid learner event. */
export const validEvent = (value: unknown): value is LearnerEvent => validate(value);

/** Whether a value is a valid learner event of before the lexical model (schema 1). */
export const validOldEvent = (value: unknown): value is LearnerEventV1 => validateBefore(value);
