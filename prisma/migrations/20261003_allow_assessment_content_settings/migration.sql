-- Allow the item-selection mode to live beside the assessment content.
--
-- The teacher chooses, per assessment period, whether a run administers the
-- first items in the saved order ("fixed") or draws a different combination of
-- them for every assessment ("random"). That choice is stored in
-- assessment_content under the reserved category 'settings', which the
-- original category check rejected.
--
-- This only widens what the column accepts: every value that was valid before
-- is still valid, no existing row changes, and no column, index or key is
-- touched. It is safe to run more than once, and safe to run before or after
-- the application deploy.
--
-- The companion position check ("position" > 0) is deliberately left alone;
-- the setting is stored at position 1.

ALTER TABLE public.assessment_content
  DROP CONSTRAINT IF EXISTS assessment_content_category_check;

ALTER TABLE public.assessment_content
  ADD CONSTRAINT assessment_content_category_check
  CHECK (category IN ('letters', 'words', 'stories', 'settings'));
