import { useState } from 'react'

export type WallpaperChoice = 'auto' | 'light' | 'dark' | 'custom'

/**
 * Desk wallpaper preferences: persisted per browser, with an optional custom
 * image kept as a data URL. Toast copy is injected so this hook stays free of
 * App-level UI state.
 */
export function useWallpaper(showToast: (message: string) => void) {
  const [wallpaperOn, setWallpaperOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('zut:wallpaper') !== 'off'
    } catch {
      return true
    }
  })

  const [wallpaperChoice, setWallpaperChoice] = useState<WallpaperChoice>(() => {
    try {
      const choice = localStorage.getItem('zut:wallpaper-choice')
      return choice === 'light' || choice === 'dark' || choice === 'custom' ? choice : 'auto'
    } catch {
      return 'auto'
    }
  })

  const [customWallpaper, setCustomWallpaper] = useState<string | null>(() => {
    try {
      return localStorage.getItem('zut:wallpaper-custom')
    } catch {
      return null
    }
  })

  const [wallpaperMenuOpen, setWallpaperMenuOpen] = useState(false)

  const toggleWallpaper = () => {
    setWallpaperOn((value) => {
      const next = !value
      try {
        localStorage.setItem('zut:wallpaper', next ? 'on' : 'off')
      } catch {
        /* private mode / quota — keep the in-memory choice */
      }
      return next
    })
  }

  const chooseWallpaper = (choice: WallpaperChoice) => {
    setWallpaperChoice(choice)
    try {
      localStorage.setItem('zut:wallpaper-choice', choice)
    } catch {
      /* ignore */
    }
    setWallpaperMenuOpen(false)
  }

  const handleWallpaperUpload = (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Pick an image file.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result ?? '')
      if (!url) return
      try {
        localStorage.setItem('zut:wallpaper-custom', url)
      } catch {
        showToast('Image too large to keep — try a smaller one.')
        return
      }
      setCustomWallpaper(url)
      chooseWallpaper('custom')
      showToast('Wallpaper updated.')
    }
    reader.readAsDataURL(file)
  }

  return {
    wallpaperOn,
    wallpaperChoice,
    customWallpaper,
    wallpaperMenuOpen,
    setWallpaperMenuOpen,
    toggleWallpaper,
    chooseWallpaper,
    handleWallpaperUpload,
  }
}
