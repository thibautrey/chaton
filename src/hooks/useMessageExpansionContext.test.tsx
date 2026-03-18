import { renderHook, act } from '@testing-library/react'
import { MessageExpansionProvider, useMessageExpansion } from './useMessageExpansionContext'

describe('useMessageExpansion', () => {
  it('should collapse all registered messages', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MessageExpansionProvider>{children}</MessageExpansionProvider>
    )

    const { result } = renderHook(() => useMessageExpansion(), { wrapper })

    // Mock collapse callbacks
    const mockCollapse1 = jest.fn()
    const mockCollapse2 = jest.fn()

    // Register messages
    act(() => {
      result.current.registerMessage('msg1', mockCollapse1)
      result.current.registerMessage('msg2', mockCollapse2)
    })

    // Trigger collapse all
    act(() => {
      result.current.collapseAllMessages()
    })

    // Verify callbacks were called
    expect(mockCollapse1).toHaveBeenCalled()
    expect(mockCollapse2).toHaveBeenCalled()

    // Unregister and verify cleanup
    act(() => {
      result.current.unregisterMessage('msg1')
    })

    // Register a new message and collapse again
    const mockCollapse3 = jest.fn()
    act(() => {
      result.current.registerMessage('msg3', mockCollapse3)
      result.current.collapseAllMessages()
    })

    // Only the new message should be collapsed
    expect(mockCollapse3).toHaveBeenCalled()
  })
})