import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  deleteOwnComment,
  hideCommentByAuthor,
  listVisibleComments,
  postComment,
  CommentError,
} from "~/services/comments/comments.server";

const NOW = 1_733_000_000_000;

async function seed() {
  const author = "c-author";
  const themeId = "c-theme";
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, handle, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
  )
    .bind(
      author,
      author,
      author,
      NOW,
      NOW,
      "c-user",
      "c-user",
      "c-user",
      NOW,
      NOW,
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, ?, 'c-theme', 'en', 1, 'public', 'clean', 'ready', 0, 0, ?, ?)`,
  )
    .bind(themeId, author, NOW, NOW)
    .run();
  return { author, themeId };
}

describe("comments service", () => {
  it("lists visible comments newest first and supports self-delete + author hide", async () => {
    const { author, themeId } = await seed();

    const c1 = await postComment(env.DB, {
      themeId,
      userId: "c-user",
      authorLabel: "Commenter",
      body: "First",
      now: NOW,
    });
    const c2 = await postComment(env.DB, {
      themeId,
      userId: "c-user",
      authorLabel: "Commenter",
      body: "Second",
      now: NOW + 10,
    });

    let listed = await listVisibleComments(env.DB, themeId);
    expect(listed.map((c) => c.id)).toEqual([c2.id, c1.id]);

    await deleteOwnComment(env.DB, {
      commentId: c1.id,
      userId: "c-user",
      now: NOW + 20,
    });
    listed = await listVisibleComments(env.DB, themeId);
    const deleted = listed.find((c) => c.id === c1.id);
    expect(deleted?.isDeletedMarker).toBe(true);
    expect(deleted?.body).toBeNull();

    await hideCommentByAuthor(env.DB, {
      commentId: c2.id,
      authorUserId: author,
      now: NOW + 30,
    });
    listed = await listVisibleComments(env.DB, themeId);
    expect(listed.find((c) => c.id === c2.id)).toBeUndefined();

    await expect(
      hideCommentByAuthor(env.DB, {
        commentId: c1.id,
        authorUserId: "c-user",
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
    } satisfies Partial<CommentError>);
  });
});
