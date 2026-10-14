// A final message this short is its own summary; longer ones go to a small model.
export const SHORT = 80

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

export const quickSummary = (answer: string) => {
  const line = oneLine(answer)

  return line.length > 0 && line.length <= SHORT ? line : undefined
}

export const summaryPrompt = (answer: string) =>
  [
    "Below is the final message of a coding assistant's turn.",
    'In at most 12 words, past tense, with no subject, say what was done (e.g. "added MIT license and README section").',
    'Reply with that line alone.',
    '',
    '<message>',
    answer.slice(0, 8000),
    '</message>',
  ].join('\n')

export const cleanSummary = (reply: string) => oneLine(reply).replace(/^["'`]+|["'`]+$/g, '').replace(/\.$/, '') || undefined
