'use strict';

export const toHuman = (text: string) => {
  return text
    .split('_')
    .map((word) => {
      return word[0].toUpperCase() + word.substring(1);
    })
    .join(' ');
};
