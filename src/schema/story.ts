import { z } from 'zod';

export const lengthValueSchema = z.union([z.number(), z.string()]);

export const layoutBoxSchema = z.object({
  x: lengthValueSchema.optional().default(0),
  y: lengthValueSchema.optional().default(0),
  width: lengthValueSchema.optional(),
  height: lengthValueSchema.optional(),
  fit: z.enum(['contain', 'cover', 'fill', 'none']).optional(),
  horizontalAlign: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'center', 'bottom']).optional(),
});

export const cueSchema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  text: z.string().optional(),
});

export const assetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('image'),
    src: z.string(),
  }),
  z.object({
    type: z.literal('audio'),
    src: z.string(),
    channel: z.enum(['vo', 'sfx', 'music']).optional().default('vo'),
  }),
  z.object({
    type: z.literal('vtt'),
    src: z.string(),
  }),
  z.object({
    type: z.literal('html'),
    src: z.string(),
  }),
]);

export const tapActionSchema = z.union([
  z.object({ play: z.string() }),
  z.object({
    toggleClass: z.object({
      target: z.string(),
      className: z.string(),
    }),
  }),
]);

const textBlockSchema = z.object({
  id: z.string(),
  type: z.literal('text'),
  layout: layoutBoxSchema.optional().default({}),
  html: z.string().optional(),
  htmlSrc: z.string().optional(),
  style: z
    .object({
      fontFamily: z.string().optional(),
      fontSize: z.string().optional(),
      color: z.string().optional(),
      textAlign: z.enum(['left', 'center', 'right']).optional(),
      lineHeight: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});

const imageBlockSchema = z.object({
  id: z.string(),
  type: z.literal('image'),
  asset: z.string(),
  layout: layoutBoxSchema.optional().default({}),
  className: z.string().optional(),
});

const hotspotBlockSchema = z.object({
  id: z.string(),
  type: z.literal('hotspot'),
  layout: layoutBoxSchema.optional().default({}),
  onTap: z.array(tapActionSchema).optional().default([]),
  ariaLabel: z.string().optional(),
});

export const blockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  imageBlockSchema,
  hotspotBlockSchema,
]);

export const pageSchema = z.object({
  id: z.string(),
  background: z
    .object({
      asset: z.string().optional(),
      color: z.string().optional(),
    })
    .optional(),
  readAloud: z
    .object({
      audio: z.string(),
      cues: z.union([z.string(), z.array(cueSchema)]).optional(),
    })
    .optional(),
  blocks: z.array(blockSchema).optional().default([]),
});

export const storySchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  pageSize: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  layout: z
    .object({
      mode: z.enum(['single', 'two-page', 'auto']).default('auto'),
      singleBreakpoint: z.number().positive().default(900),
    })
    .default({ mode: 'auto', singleBreakpoint: 900 }),
  fonts: z
    .array(
      z.object({
        family: z.string(),
        src: z.string(),
        weight: z.union([z.string(), z.number()]).optional(),
        style: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
  assets: z.record(assetSchema).optional().default({}),
  pages: z.array(pageSchema).min(1),
});

export type Story = z.infer<typeof storySchema>;
export type StoryPage = z.infer<typeof pageSchema>;
export type StoryBlock = z.infer<typeof blockSchema>;
export type StoryAsset = z.infer<typeof assetSchema>;
export type Cue = z.infer<typeof cueSchema>;
export type LayoutBox = z.infer<typeof layoutBoxSchema>;
export type LayoutMode = 'single' | 'two-page' | 'auto';
export type ResolvedLayoutMode = 'single' | 'two-page';
export type TapAction = z.infer<typeof tapActionSchema>;
export type AudioChannel = 'vo' | 'sfx' | 'music';

export function parseStory(data: unknown): Story {
  return storySchema.parse(data);
}
