import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Markdown } from './markdown'

const { renderDiagram } = vi.hoisted(() => ({
  renderDiagram: vi.fn(async (id: string, source: string) => {
    if (source.includes('invalid diagram')) throw new Error('Invalid Mermaid syntax')
    return { svg: `<svg id="${id}"><text>Rendered diagram</text></svg>` }
  }),
}))

// SVG layout needs a browser; leave Streamdown real and stub only Mermaid's layout engine.
vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid', type: 'diagram', language: 'mermaid', getMermaid: () => ({ render: renderDiagram }) },
}))

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
    observe() { queueMicrotask(() => this.callback([{ isIntersecting: true }])) }
    takeRecords() { return [] }
    unobserve() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  renderDiagram.mockClear()
  vi.unstubAllGlobals()
})

const fence = (source: string) => `\`\`\`mermaid\n${source}\n\`\`\``

describe('Markdown Mermaid previews', () => {
  it('renders Mermaid with source copying and keeps normal code fences', async () => {
    const flow = 'flowchart LR\n  A[Client] --> B[Gateway]'
    const { container } = render(<Markdown>{`${fence(flow)}\n\n\`\`\`text\nplain code\n\`\`\``}</Markdown>)

    await waitFor(() => expect(renderDiagram).toHaveBeenCalledTimes(1))
    expect(renderDiagram.mock.calls.map(([, source]) => source.trim())).toEqual([flow])
    expect(container.querySelectorAll('[data-streamdown="mermaid-block-actions"] [data-streamdown="code-block-copy-button"]')).toHaveLength(1)
    expect(container.querySelector('[data-language="text"]')?.textContent).toContain('plain code')
    expect(screen.queryByTitle('View fullscreen')).toBeNull()
    expect(screen.queryByTitle('Download diagram')).toBeNull()
  })

  it('keeps the source available on syntax errors and recovers when content changes', async () => {
    const { rerender } = render(<Markdown>{`Before.\n\n${fence('invalid diagram')}\n\nAfter.`}</Markdown>)
    await screen.findByText(/Invalid Mermaid syntax/)
    fireEvent.click(screen.getByText('Show Code'))
    expect(screen.getByText('invalid diagram')).toBeTruthy()
    expect(screen.getByText('After.')).toBeTruthy()

    rerender(<Markdown>{fence('flowchart LR\n  A --> B')}</Markdown>)
    await screen.findByRole('img', { name: 'Mermaid chart' })
    expect(screen.queryByText(/Invalid Mermaid syntax/)).toBeNull()
  })

  it('handles an incomplete streaming fence followed by a complete diagram', async () => {
    const { rerender } = render(<Markdown>{'```mermaid\nflowchart LR\n  A --> B'}</Markdown>)
    await screen.findByRole('img', { name: 'Mermaid chart' })
    rerender(<Markdown>{fence('flowchart LR\n  A --> B\n  B --> C')}</Markdown>)
    await waitFor(() => expect(renderDiagram.mock.calls.at(-1)?.[1]).toContain('B --> C'))
  })

  it('keeps compact inline previews text-only', () => {
    const { container } = render(<Markdown inline>{fence('flowchart LR\n  A --> B')}</Markdown>)
    expect(container.querySelector('[data-streamdown="mermaid-block"], button, svg')).toBeNull()
    expect(container.textContent).toContain('A --> B')
    expect(renderDiagram).not.toHaveBeenCalled()
  })
})
