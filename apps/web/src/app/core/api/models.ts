// Wire types come from the generated contract, never from hand-written interfaces: when
// openapi.yaml changes, `pnpm contracts:generate` updates these and the compiler finds every caller.
import type { components, operations } from '@coursewright/contracts';

type Schemas = components['schemas'];

export type Problem = Schemas['Problem'];
export type LoginRequest = Schemas['LoginRequest'];
export type Role = Schemas['Role'];
export type User = Schemas['User'];
export type Session = Schemas['Session'];
export type CourseLevel = Schemas['CourseLevel'];
export type CourseSummary = Schemas['CourseSummary'];
export type CoursePage = Schemas['CoursePage'];
export type Lesson = Schemas['Lesson'];
export type Course = Schemas['Course'];
export type EnrollmentRequest = Schemas['EnrollmentRequest'];
export type Enrollment = Schemas['Enrollment'];
export type EnrollmentList = Schemas['EnrollmentList'];
export type ReportRequest = Schemas['ReportRequest'];
export type JobStatus = Schemas['JobStatus'];
export type Job = Schemas['Job'];
export type RumEvent = Schemas['RumEvent'];
export type RumBatch = Schemas['RumBatch'];

export type CourseSearchParams = NonNullable<operations['searchCourses']['parameters']['query']>;
