import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { compressImage, publicUrl, uploadToTrade } from '../lib/media'
import { useToast } from './ui'

// Rich lesson-notes editor. Pictures are uploaded to storage (not stored inside the text).
export default function RichEditor({ value, onChange, tradeId }) {
  const toast = useToast()
  const fileRef = useRef()
  const tradeRef = useRef(tradeId); tradeRef.current = tradeId

  async function addImage(editor, file) {
    try {
      const small = await compressImage(file)
      const { path } = await uploadToTrade(tradeRef.current, small, file.name)
      editor.chain().focus().setImage({ src: publicUrl(path), alt: file.name }).run()
    } catch (e) { toast(e.message, 'err') }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Image, TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      handlePaste(view, ev) {
        const f = [...(ev.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'))
        if (f) { ev.preventDefault(); addImage(editorRef.current, f); return true }
        return false
      },
      handleDrop(view, ev) {
        const f = [...(ev.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'))
        if (f) { ev.preventDefault(); addImage(editorRef.current, f); return true }
        return false
      },
    },
  })
  const editorRef = useRef(); editorRef.current = editor

  // external reset (e.g. restoring an older version)
  useEffect(() => { if (editor && value !== editor.getHTML() && !editor.isFocused) editor.commands.setContent(value || '', false) }, [value, editor])

  if (!editor) return null
  const B = ({ on, run, children, title, active }) => (
    <button type="button" title={title} aria-label={title} className={active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={run} disabled={on === false}>{children}</button>
  )
  const c = () => editor.chain().focus()
  const inTable = editor.isActive('table')

  return (
    <div className="rte">
      <div className="rte-bar" role="toolbar" aria-label="Formatting">
        <B title="Bold" active={editor.isActive('bold')} run={() => c().toggleBold().run()}>B</B>
        <B title="Italic" active={editor.isActive('italic')} run={() => c().toggleItalic().run()}><i>I</i></B>
        <B title="Underline" active={editor.isActive('underline')} run={() => c().toggleUnderline().run()}><u>U</u></B>
        <B title="Strikethrough" active={editor.isActive('strike')} run={() => c().toggleStrike().run()}><s>S</s></B>
        <span className="sep" />
        <B title="Heading" active={editor.isActive('heading', { level: 2 })} run={() => c().toggleHeading({ level: 2 }).run()}>H2</B>
        <B title="Sub-heading" active={editor.isActive('heading', { level: 3 })} run={() => c().toggleHeading({ level: 3 }).run()}>H3</B>
        <B title="Bulleted list" active={editor.isActive('bulletList')} run={() => c().toggleBulletList().run()}>• List</B>
        <B title="Numbered list" active={editor.isActive('orderedList')} run={() => c().toggleOrderedList().run()}>1. List</B>
        <B title="Quote" active={editor.isActive('blockquote')} run={() => c().toggleBlockquote().run()}>❝</B>
        <B title="Code block" active={editor.isActive('codeBlock')} run={() => c().toggleCodeBlock().run()}>{'</>'}</B>
        <span className="sep" />
        <B title="Align left" active={editor.isActive({ textAlign: 'left' })} run={() => c().setTextAlign('left').run()}>⇤</B>
        <B title="Centre" active={editor.isActive({ textAlign: 'center' })} run={() => c().setTextAlign('center').run()}>↔</B>
        <B title="Link" active={editor.isActive('link')} run={() => {
          const prev = editor.getAttributes('link').href || ''
          const url = window.prompt('Link address (leave empty to remove)', prev)
          if (url === null) return
          url === '' ? c().unsetLink().run() : c().setLink({ href: url }).run()
        }}>🔗</B>
        <B title="Insert picture" run={() => fileRef.current.click()}>🖼️</B>
        <B title="Insert table" run={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦ Table</B>
        {inTable && <>
          <B title="Add row below" run={() => c().addRowAfter().run()}>+Row</B>
          <B title="Delete row" run={() => c().deleteRow().run()}>−Row</B>
          <B title="Add column after" run={() => c().addColumnAfter().run()}>+Col</B>
          <B title="Delete column" run={() => c().deleteColumn().run()}>−Col</B>
          <B title="Delete table" run={() => c().deleteTable().run()}>🗑 Table</B>
        </>}
        <span className="sep" />
        <B title="Undo" run={() => c().undo().run()}>↶</B>
        <B title="Redo" run={() => c().redo().run()}>↷</B>
        <B title="Clear formatting" run={() => c().unsetAllMarks().clearNodes().run()}>Tx</B>
      </div>
      <EditorContent editor={editor} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) addImage(editor, f) }} />
    </div>
  )
}
