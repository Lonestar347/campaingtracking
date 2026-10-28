"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/domain/enums";
import { formatDateTime, formatRelativeTime, type CommentEntry } from "@/lib/activity";
import {
  addComment,
  deleteComment,
  updateComment,
  type CommentActionResult,
  type CommentTarget,
} from "@/app/campaigns/comment-actions";
import { Avatar } from "@/components/team/avatar";

export interface ThreadUser {
  id: string;
  role: UserRole;
}

function CommentForm({
  initial = "",
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  initial?: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<CommentActionResult>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    if (!body.trim()) {
      setError("Write a comment first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(body);
      if (result.ok) {
        setBody("");
        onCancel?.();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        maxLength={2000}
        placeholder="Write a comment…"
        aria-label="Comment"
        aria-invalid={!!error}
        autoFocus={autoFocus}
      />
      {error && (
        <p className="text-xs font-medium text-status-red" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">Ctrl + Enter to send</span>
      </div>
    </form>
  );
}

export function CommentThread({
  target,
  comments,
  user,
}: {
  target: CommentTarget;
  comments: CommentEntry[];
  user: ThreadUser | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const canComment = !!user && can(user.role, "comment");
  const now = new Date();

  const remove = (comment: CommentEntry) => {
    if (!window.confirm("Delete this comment?")) return;
    startTransition(async () => {
      const result = await deleteComment(comment.id);
      if (result.ok) router.refresh();
      else window.alert(result.error);
    });
  };

  return (
    <section aria-label="Comments">
      <h3 className="mb-2 text-sm font-semibold">
        Comments {comments.length > 0 && <span className="font-normal text-muted-foreground">({comments.length})</span>}
      </h3>
      {comments.length === 0 && <p className="mb-3 text-sm text-muted-foreground">No comments yet.</p>}
      <ul className={pending ? "space-y-3 opacity-60" : "space-y-3"}>
        {comments.map((comment) => {
          const own = user?.id === comment.author.id;
          const mayDelete = own || (!!user && can(user.role, "manage"));
          const edited = comment.updatedAt.getTime() - comment.createdAt.getTime() > 1000;
          return (
            <li key={comment.id} className="group flex gap-2.5">
              <Avatar name={comment.author.name} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-semibold text-foreground">{comment.author.name}</span>
                  <time className="text-muted-foreground" dateTime={comment.createdAt.toISOString()} title={formatDateTime(comment.createdAt)} suppressHydrationWarning>
                    {formatRelativeTime(comment.createdAt, now)}
                  </time>
                  {edited && <span className="text-muted-foreground">(edited)</span>}
                </p>
                {editing === comment.id ? (
                  <div className="mt-1.5">
                    <CommentForm
                      initial={comment.body}
                      submitLabel="Save"
                      onSubmit={(body) => updateComment(comment.id, body)}
                      onCancel={() => setEditing(null)}
                      autoFocus
                    />
                  </div>
                ) : (
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm">{comment.body}</p>
                )}
              </div>
              {editing !== comment.id && (own || mayDelete) && (
                <span className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  {own && (
                    <Button size="icon-sm" variant="ghost" aria-label="Edit comment" onClick={() => setEditing(comment.id)}>
                      <Pencil />
                    </Button>
                  )}
                  {mayDelete && (
                    <Button size="icon-sm" variant="ghost" aria-label="Delete comment" onClick={() => remove(comment)}>
                      <Trash2 />
                    </Button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {canComment && (
        <div className="mt-3">
          <CommentForm submitLabel="Comment" onSubmit={(body) => addComment(target, body)} />
        </div>
      )}
    </section>
  );
}
