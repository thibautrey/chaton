import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationUrlViewer } from './NotificationUrlViewer'

describe('NotificationUrlViewer', () => {
  it('renders only http and https URLs in the iframe', () => {
    render(<NotificationUrlViewer url=" https://example.com/docs " onClose={vi.fn()} />)

    const iframe = screen.getByTitle('Notification content') as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toBe('https://example.com/docs')
  })

  it('rejects non-web URL schemes before rendering an iframe', () => {
    render(<NotificationUrlViewer url="javascript:alert(1)" onClose={vi.fn()} />)

    expect(screen.getByText('Invalid URL')).toBeTruthy()
    expect(screen.queryByTitle('Notification content')).toBeNull()
  })
})
