create table "assessment_content" (
  "id" SERIAL NOT NULL,
  "teacher_id" INTEGER NOT NULL,
  "assessment_period" "AssessmentPeriod" NOT NULL,
  "category" VARCHAR(20) NOT NULL,
  "position" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "story_title" VARCHAR(200),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "assessment_content_pkey" PRIMARY KEY ("id")
);

create unique index "assessment_content_teacher_id_assessment_period_category_position_key"
  on "assessment_content"("teacher_id", "assessment_period", "category", "position");

create index "assessment_content_teacher_id_assessment_period_category_position_idx"
  on "assessment_content"("teacher_id", "assessment_period", "category", "position");

alter table "assessment_content"
  add constraint "assessment_content_teacher_id_fkey"
  foreign key ("teacher_id") references "users"("id")
  on delete cascade on update cascade;
