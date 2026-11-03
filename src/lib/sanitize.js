import DOMPurify from 'dompurify'

// Everything that is rendered as HTML (lesson notes — which can come from the shared
// repository, i.e. from other people) goes through this first.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function clean(html) {
  return DOMPurify.sanitize(html || '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload'],
  })
}

export const isEmptyHtml = (h) => !h || !String(h).replace(/<[^>]*>/g, '').trim() && !/<img/i.test(h)
