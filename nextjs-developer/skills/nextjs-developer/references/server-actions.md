# Server Actions

> Next.js 14+ / React 19. Uses `useActionState` (NOT deprecated `useFormState`), `useOptimistic` (NOT `experimental_useOptimistic`).

## Security Model

Server Actions are **public HTTP POST endpoints**. Any client can call them with any payload. Treat them like API routes.

```tsx
// This server action is accessible at a generated URL like:
// POST /_next/action/abc123def456
// Anyone with the URL can send any FormData to it.
'use server'

export async function deleteUser(formData: FormData) {
  // WITHOUT auth check: anyone can delete any user
  // This is the #1 server action security mistake

  const session = await auth()
  if (!session) throw new Error('Unauthorized')

  const userId = formData.get('userId') as string

  // WITHOUT authorization check: any logged-in user can delete any other user
  if (session.user.id !== userId && session.user.role !== 'admin') {
    throw new Error('Forbidden')
  }

  await db.user.delete({ where: { id: userId } })
  revalidatePath('/admin/users')
}
```

### Closure Encryption

When a server action is defined inside a Server Component, closed-over variables are encrypted before being sent to the client. But do NOT rely on this for sensitive data.

```tsx
// app/page.tsx
export default async function Page() {
  const secretKey = process.env.API_KEY

  async function submitForm() {
    'use server'
    // secretKey is encrypted in the client payload,
    // but it still travels through the network.
    // Prefer fetching secrets inside the action body instead.
  }
}
```

### CSRF Protection

Next.js automatically includes CSRF tokens (Origin header checking) for server actions. Non-browser clients will be rejected unless they set the correct Origin header. This is built-in; do not disable it.

## Validated Server Action Pattern

```tsx
// app/actions/post.ts
'use server'

import { z } from 'zod'
import { auth } from '@/lib/auth'
import { revalidateTag } from 'next/cache'

const CreatePostSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(10).max(50000),
  categoryId: z.string().uuid(),
})

// Return type enforces consistent error handling across the app
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createPost(
  prevState: ActionResult,  // Required by useActionState
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const session = await auth()
  if (!session) return { success: false, error: 'Unauthorized' }

  const parsed = CreatePostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
    categoryId: formData.get('categoryId'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  try {
    const post = await db.post.create({
      data: { ...parsed.data, authorId: session.user.id },
    })

    revalidateTag('posts')
    return { success: true, data: { id: post.id } }
  } catch (e) {
    // Log full error server-side, return generic message to client
    console.error('createPost failed:', e)
    return { success: false, error: 'Failed to create post' }
  }
}
```

## `useActionState` (React 19)

Replaces deprecated `useFormState`. Manages form state including pending status.

```tsx
// components/create-post-form.tsx
'use client'

import { useActionState } from 'react'  // React 19 — NOT from 'react-dom'
import { createPost } from '@/app/actions/post'

export function CreatePostForm() {
  const [state, formAction, isPending] = useActionState(
    createPost,
    { success: false, error: '' } // Initial state
  )

  return (
    <form action={formAction}>
      <fieldset disabled={isPending}>
        <div>
          <input name="title" placeholder="Title" />
          {state.fieldErrors?.title && (
            <p className="text-red-500 text-sm">{state.fieldErrors.title[0]}</p>
          )}
        </div>

        <div>
          <textarea name="content" placeholder="Content" />
          {state.fieldErrors?.content && (
            <p className="text-red-500 text-sm">{state.fieldErrors.content[0]}</p>
          )}
        </div>

        <input type="hidden" name="categoryId" value="..." />

        <button type="submit">
          {isPending ? 'Creating...' : 'Create Post'}
        </button>

        {!state.success && state.error && (
          <p className="text-red-500">{state.error}</p>
        )}
      </fieldset>
    </form>
  )
}
```

**Key difference from `useFormState`:** `useActionState` returns `isPending` as the third element. No need for a separate `useFormStatus` component for pending state.

## `.bind()` for Arguments

Instead of hidden inputs, use `.bind()` to pass extra arguments to server actions. Cleaner and type-safe.

```tsx
// app/posts/page.tsx
import { deletePost } from '@/app/actions/post'

export default async function PostList() {
  const posts = await getPosts()

  return (
    <ul>
      {posts.map((post) => {
        // Bind the post ID as the first argument
        const deleteWithId = deletePost.bind(null, post.id)

        return (
          <li key={post.id}>
            {post.title}
            <form action={deleteWithId}>
              <button type="submit">Delete</button>
            </form>
          </li>
        )
      })}
    </ul>
  )
}

// app/actions/post.ts
'use server'

export async function deletePost(
  postId: string,       // Bound argument (first)
  formData: FormData    // FormData is always last
) {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')

  // Verify ownership
  const post = await db.post.findUnique({ where: { id: postId } })
  if (post?.authorId !== session.user.id) throw new Error('Forbidden')

  await db.post.delete({ where: { id: postId } })
  revalidateTag('posts')
}
```

**Trade-off vs hidden inputs:** `.bind()` keeps the argument out of the DOM (no `<input type="hidden">` that users can modify in DevTools). The bound value is still encrypted in the server action payload.

## `useOptimistic` (React 19)

Stable API. Immediately update UI before the server responds, revert on error.

```tsx
// components/like-button.tsx
'use client'

import { useOptimistic, useTransition } from 'react'
import { toggleLike } from '@/app/actions/likes'

export function LikeButton({
  postId,
  initialLiked,
  initialCount,
}: {
  postId: string
  initialLiked: boolean
  initialCount: number
}) {
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic(
    { liked: initialLiked, count: initialCount },
    (current, newLiked: boolean) => ({
      liked: newLiked,
      count: current.count + (newLiked ? 1 : -1),
    })
  )

  function handleClick() {
    startTransition(async () => {
      const newLiked = !optimistic.liked
      setOptimistic(newLiked)  // Instant UI update
      await toggleLike(postId) // Server call; reverts optimistic state on error
    })
  }

  return (
    <button onClick={handleClick} disabled={isPending}>
      {optimistic.liked ? 'Unlike' : 'Like'} ({optimistic.count})
    </button>
  )
}
```

## `useTransition` with Server Actions

For non-form server action calls, wrap in `useTransition` to avoid blocking the UI.

```tsx
'use client'

import { useTransition } from 'react'
import { updateSettings } from '@/app/actions/settings'

export function SettingsToggle({ settingKey, value }: { settingKey: string; value: boolean }) {
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    startTransition(async () => {
      // This runs without blocking the UI
      // React keeps the previous UI visible during the transition
      await updateSettings(settingKey, !value)
    })
  }

  return (
    <button onClick={handleToggle} className={isPending ? 'opacity-50' : ''}>
      {value ? 'Enabled' : 'Disabled'}
    </button>
  )
}
```

## Concurrent Mutations

Multiple server action calls from the same form queue automatically. But programmatic calls can fire concurrently.

```tsx
// Problem: Rapid clicking sends multiple delete requests
// Each resolves independently, potentially causing race conditions

// Solution: Disable during transition or debounce
'use client'

import { useTransition } from 'react'

export function DeleteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      disabled={isPending}  // Prevents concurrent calls
      onClick={() => {
        startTransition(async () => {
          await deleteItem(id)
        })
      }}
    >
      {isPending ? 'Deleting...' : 'Delete'}
    </button>
  )
}
```

**Form actions:** When a `<form action={serverAction}>` is submitted while a previous submission is still pending, the new submission queues. The form is not reset between submissions.

**Programmatic calls:** `await serverAction()` calls are NOT queued. Two rapid clicks = two concurrent requests. Always guard with `useTransition` or disable the trigger.

## Revalidation Strategies

```tsx
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function updatePost(postId: string, formData: FormData) {
  await db.post.update({ where: { id: postId }, data: { /* ... */ } })

  // Option 1: Revalidate specific page (re-renders that page)
  revalidatePath(`/posts/${postId}`)

  // Option 2: Revalidate layout (re-renders all pages under that layout)
  revalidatePath('/posts', 'layout')

  // Option 3: Tag-based (invalidates all fetch() calls tagged 'posts')
  // Most granular, preferred for complex apps
  revalidateTag('posts')

  // redirect() must be called AFTER revalidation
  // It throws internally (NEXT_REDIRECT), so no code after it executes
  redirect(`/posts/${postId}`)
}
```

**Failure mode:** Calling `redirect()` before `revalidatePath()` means the revalidation never happens. The redirect throws immediately.

## When NOT to Use Server Actions

- **Read operations:** Use Server Components for data fetching. Server actions are for mutations.
- **Long-running tasks:** Server actions have execution time limits (Vercel: 10-900s depending on plan). Use background jobs instead.
- **File downloads:** Use Route Handlers (`route.ts`) with streaming responses.
- **WebSocket / real-time:** Server actions are request-response. Use Route Handlers with SSE or external WebSocket services.
- **Public APIs consumed by third parties:** Use Route Handlers with proper REST/GraphQL conventions.

## Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Action works in dev, 405 in production | Server action not included in build | Ensure `'use server'` is at file or function top |
| Stale data after mutation | Missing `revalidatePath` / `revalidateTag` | Add revalidation after every mutation |
| `redirect()` after action does nothing | `redirect()` called inside try/catch | `redirect()` throws; do not catch it, or re-throw NEXT_REDIRECT |
| Form submits but UI does not update | Using `useFormState` (deprecated) | Migrate to `useActionState` (React 19) |
| Race condition on rapid clicks | No concurrency guard | Use `useTransition` + disabled state |
| `Cannot read properties of undefined` on `formData` | `.bind()` argument count mismatch | Bound args come first, `formData` is always last parameter |
