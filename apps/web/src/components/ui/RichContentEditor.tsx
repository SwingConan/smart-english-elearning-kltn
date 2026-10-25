import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Quote } from 'lucide-react';
import { useEffect } from 'react';

export function RichContentEditor({
  value,
  onChange,
  onInsertImage,
}: {
  value: string;
  onChange: (html: string) => void;
  onInsertImage: () => Promise<string | null>;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
      Image.configure({ allowBase64: false }),
    ],
    content: value,
    editorProps: {
      attributes: { class: 'min-h-72 px-4 py-3 outline-none prose prose-slate max-w-none' },
      transformPastedHTML: (html) => html.replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, ''),
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });
  useEffect(() => {
    if (editor && value !== editor.getHTML())
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  if (!editor) return <div className="h-72 animate-pulse rounded-xl bg-slate-100" />;
  const image = async () => {
    const url = await onInsertImage();
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };
  const link = () => {
    const href = window.prompt('Địa chỉ liên kết HTTPS');
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };
  const controls = [
    [Bold, 'Đậm', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold')],
    [
      Italic,
      'Nghiêng',
      () => editor.chain().focus().toggleItalic().run(),
      editor.isActive('italic'),
    ],
    [
      Heading2,
      'Tiêu đề',
      () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      editor.isActive('heading', { level: 2 }),
    ],
    [
      List,
      'Danh sách',
      () => editor.chain().focus().toggleBulletList().run(),
      editor.isActive('bulletList'),
    ],
    [
      ListOrdered,
      'Danh sách số',
      () => editor.chain().focus().toggleOrderedList().run(),
      editor.isActive('orderedList'),
    ],
    [
      Quote,
      'Trích dẫn',
      () => editor.chain().focus().toggleBlockquote().run(),
      editor.isActive('blockquote'),
    ],
    [Link2, 'Liên kết', link, editor.isActive('link')],
  ] as const;
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap gap-1 border-b bg-slate-50 p-2">
        {controls.map(([Icon, label, action, active]) => (
          <button
            aria-label={label}
            className={`rounded-lg p-2 ${active ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-white'}`}
            key={label}
            onClick={action}
            type="button"
          >
            <Icon size={17} />
          </button>
        ))}
        <button
          aria-label="Chèn ảnh đã quản lý"
          className="rounded-lg p-2 hover:bg-white"
          onClick={() => void image()}
          type="button"
        >
          <ImagePlus size={17} />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
