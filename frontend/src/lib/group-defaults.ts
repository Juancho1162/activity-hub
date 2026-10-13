import type { GroupDraft } from './api'

export function basicGroupDrafts(language: 'es' | 'en'): GroupDraft[] {
  return [
    { name: 'Personal', icon: 'sprout' },
    { name: language === 'en' ? 'Projects' : 'Proyectos', icon: 'work' },
    { name: language === 'en' ? 'Learning' : 'Aprendizaje', icon: 'book' },
    { name: language === 'en' ? 'Health' : 'Salud', icon: 'health' },
    { name: language === 'en' ? 'Creativity' : 'Creatividad', icon: 'art' },
  ]
}
