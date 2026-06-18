// Block model for the Notion/Obsidian-style note editor. The note is still STORED as
// markdown (so the graph, backlinks, search and MarkdownView preview keep working) —
// these helpers just parse markdown ↔ an editable list of blocks and back, losslessly
// enough for round-tripping (parse(serialize(x)) === x for the supported set).

export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'todoDone'
  | 'quote'
  | 'code'
  | 'divider'

export interface Block {
  id: string
  type: BlockType
  text: string // for 'code' this may contain newlines; for 'divider' it's ''
}

let _seq = 0
export function newBlockId(): string {
  // unique + stable-enough React key; Math.random is fine in renderer code
  _seq += 1
  return `b${_seq}_${Math.random().toString(36).slice(2, 8)}`
}

export function blankBlock(type: BlockType = 'paragraph'): Block {
  return { id: newBlockId(), type, text: '' }
}

// list-ish blocks continue themselves on Enter; headings/quote drop back to paragraph
export const LIST_TYPES: BlockType[] = ['bullet', 'numbered', 'todo', 'todoDone']

export function parseBlocks(md: string): Block[] {
  const lines = (md ?? '').split('\n')
  const blocks: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // fenced code block — collect until the closing fence
    if (/^```/.test(line)) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      // i now points at the closing fence (or past the end) — that line is consumed
      blocks.push({ id: newBlockId(), type: 'code', text: buf.join('\n') })
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ id: newBlockId(), type: 'divider', text: '' })
      continue
    }

    let m: RegExpExecArray | null
    if ((m = /^###\s+(.*)$/.exec(line))) blocks.push({ id: newBlockId(), type: 'h3', text: m[1] })
    else if ((m = /^##\s+(.*)$/.exec(line))) blocks.push({ id: newBlockId(), type: 'h2', text: m[1] })
    else if ((m = /^#\s+(.*)$/.exec(line))) blocks.push({ id: newBlockId(), type: 'h1', text: m[1] })
    else if ((m = /^[-*]\s+\[([ xX])\]\s*(.*)$/.exec(line)))
      blocks.push({ id: newBlockId(), type: m[1] === ' ' ? 'todo' : 'todoDone', text: m[2] })
    else if ((m = /^[-*]\s+(.*)$/.exec(line))) blocks.push({ id: newBlockId(), type: 'bullet', text: m[1] })
    else if ((m = /^\d+\.\s+(.*)$/.exec(line))) blocks.push({ id: newBlockId(), type: 'numbered', text: m[1] })
    else if ((m = /^>\s?(.*)$/.exec(line))) blocks.push({ id: newBlockId(), type: 'quote', text: m[1] })
    else blocks.push({ id: newBlockId(), type: 'paragraph', text: line })
  }
  if (!blocks.length) blocks.push(blankBlock())
  return blocks
}

export function blockToMarkdown(b: Block): string {
  switch (b.type) {
    case 'h1':
      return `# ${b.text}`
    case 'h2':
      return `## ${b.text}`
    case 'h3':
      return `### ${b.text}`
    case 'bullet':
      return `- ${b.text}`
    case 'numbered':
      return `1. ${b.text}`
    case 'todo':
      return `- [ ] ${b.text}`
    case 'todoDone':
      return `- [x] ${b.text}`
    case 'quote':
      return `> ${b.text}`
    case 'divider':
      return '---'
    case 'code':
      return '```\n' + b.text + '\n```'
    default:
      return b.text
  }
}

export function serializeBlocks(blocks: Block[]): string {
  return blocks.map(blockToMarkdown).join('\n')
}

// placeholder hint shown inside an empty focused block, by type
export function blockPlaceholder(type: BlockType): string {
  switch (type) {
    case 'h1':
      return 'Heading 1'
    case 'h2':
      return 'Heading 2'
    case 'h3':
      return 'Heading 3'
    case 'quote':
      return 'Quote'
    case 'code':
      return 'Code'
    case 'bullet':
    case 'numbered':
      return 'List'
    case 'todo':
    case 'todoDone':
      return 'To-do'
    default:
      return "Type '/' for commands"
  }
}
