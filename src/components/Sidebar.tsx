import { useEffect, useRef, useState } from 'react'
import type { PageSize } from '../pdf/protocol'
import { PageCanvas } from './PageCanvas'

const THUMBNAIL_WIDTH = 120

interface Props {
  pages: PageSize[]
  currentPage: number
  onSelectPage(index: number): void
}

export function Sidebar({ pages, currentPage, onSelectPage }: Props) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    itemRefs.current[currentPage]?.scrollIntoView({ block: 'nearest' })
  }, [currentPage])

  return (
    <nav ref={setContainer} className="sidebar" aria-label="Pages">
      {pages.map((size, index) => (
        <button
          key={index}
          ref={(el) => {
            itemRefs.current[index] = el
          }}
          className={`thumbnail ${index === currentPage ? 'thumbnail--active' : ''}`}
          onClick={() => onSelectPage(index)}
          aria-label={`Page ${index + 1}`}
          aria-current={index === currentPage ? 'page' : undefined}
        >
          <PageCanvas index={index} size={size} scale={THUMBNAIL_WIDTH / size.width} root={container} />
          <span className="thumbnail__label">{index + 1}</span>
        </button>
      ))}
    </nav>
  )
}
