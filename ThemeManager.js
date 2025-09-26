import { DataManager } from './DataManager.js';

export const ThemeManager = {
  init: async function (themeSelectorElement) {
    const settings = await DataManager.getSettings();
    const savedTheme = settings.theme || 'scifi';

    // Apply theme to the document element (for CSS variables)
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Apply background image to the body
    this.applyBackgroundImage(savedTheme);

    if (themeSelectorElement) {
      themeSelectorElement.value = savedTheme;
    }

    // Add event listener for theme changes
    if (themeSelectorElement) {
      themeSelectorElement.addEventListener('change', async e => {
        const newTheme = e.target.value;
        document.documentElement.setAttribute('data-theme', newTheme);
        this.applyBackgroundImage(newTheme); // Apply new background image
        await DataManager.saveSettings({ theme: newTheme });
      });
    }
  },

  applyTheme: function (themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    this.applyBackgroundImage(themeName); // Apply background image when theme is applied
  },

  applyBackgroundImage: function (themeName) {
    const body = document.body;
    let imageUrl = '';
    switch (themeName) {
      case 'scifi':
        imageUrl = 'BKG/sci-fi.png';
        break;
      case 'fantasy':
        imageUrl = 'BKG/fantasy.png';
        break;
      case 'thriller':
        imageUrl = 'BKG/thriller.png';
        break;
      case 'romance':
        imageUrl = 'BKG/romance.png';
        break;
      default:
        imageUrl = 'BKG/sci-fi.png'; // Default background
    }
    body.style.backgroundImage = `url('${imageUrl}')`;
  },
};
