import {
  Attachment,
  ExamChoiceGroupQuestion,
  ExamContent,
  ExamMultiChoiceGapQuestion,
  ExamQuestion,
  ExamSection,
  ExamTextQuestion
} from '@digabi/exam-types'
import * as libxml from 'libxmljs2'
const crypto = require('crypto')

const inlineFormulaRegexp = /\\\((.*?)\\\)/g
const displayedFormulaRegexp = /\\\[(.*?)\\\]/g

export const generateXmlfromJson = (examContent: ExamContent, attachments: Attachment[]) => {
  const decodeHtmlEntities = (str: string) => libxml.parseHtmlFragment(str).toString()

  const removeBrs = (str: string) => str.replace(/<br\/>/g, '')

  const addStringAsHtml = (el: libxml.Element, html: string) => {
    // Replacing img and a tags for backward support of existing exam definitions
    const htmlWithBackwardSupport = html
      .replace(/(<img\s+src=")([^"]+)("\s*>)(.*)(<\/img>)/g, function(a, b, filename, d, caption) {
        // img tag with caption
        return '<e:image src="' + filename.replace(/.*attachments\//gi, '') + '">' + caption + '</e:image>'
      })
      .replace(/(<img\s+src=")([^"]+)(".*>)/g, function(a, b, filename) {
        // img tag without caption
        return '<e:image src="' + filename.replace(/.*attachments\//gi, '') + '"/>'
      })
      .replace(/(<a.*href=")([^"]+)(".*>)(.*)(<\/a>)/g, function(a, b, filename, d, caption) {
        return caption + ' <e:attachment-link ref="' + filename.replace(/.*attachments\//gi, '') + '"/>'
      })

    const htmlSanitized = decodeHtmlEntities('<div>' + htmlWithBackwardSupport + '</div>')
      .trim()
      .replace(/\n/g, '<br/>')
    const htmlWithImgAndAttachmentLinkTags = htmlSanitized
      .replace(/<\/image/gi, '</e:image')
      .replace(/<image/gi, '<e:image')
      .replace(/<\/video/gi, '</e:video')
      .replace(/<video/gi, '<e:video')
      .replace(/<\/audio/gi, '</e:audio')
      .replace(/<audio/gi, '<e:audio')
      .replace(/<\/attachment-link/gi, '</e:attachment-link')
      .replace(/<attachment-link/gi, '<e:attachment-link')
      .replace(/(<e:attachment-link\s+ref=")([^"]+)(")/g, function(a, b, filename, d) {
        return b + getSHA1Hash(filename) + d
      })
      .replace(/(<e:image\s+src=")([^"]+)(")/g, function(a, startTag, filename, d) {
        // quickfix: libxml.parseHtmlFragment(str).toString() URI encodes attachment filenames
        // leading to double encoding -- attachment files with öä or spaces do not work
        return startTag + decodeURI(filename) + d
      })

    const htmlWithXmlFormulae = htmlWithImgAndAttachmentLinkTags
      .replace(inlineFormulaRegexp, (match, formula) => `<e:formula>${removeBrs(formula)}</e:formula>`)
      .replace(
        displayedFormulaRegexp,
        (match, formula) => `<e:formula mode="display">${removeBrs(formula)}</e:formula>`
      )

    const xmlDoc = libxml.parseXml(htmlWithXmlFormulae)
    const root = xmlDoc.root()!

    root.childNodes().forEach(child => {
      el.addChild(child)
    })
  }

  const buildMultiChoiceGapQuestion = (question: ExamMultiChoiceGapQuestion) => {
    const el = new libxml.Element(doc, 'e:question')

    addStringAsHtml(el.node('e:question-title'), 'Aukkomonivalintatehtävä / uppgift med flervalsluckor')
    addStringAsHtml(el.node('e:question-instruction'), question.text)

    const gapCount = question.content.filter(x => x.type === 'gap').length
    const singleScore = Math.floor(question.maxScore / gapCount)

    question.content.forEach(x => {
      switch (x.type) {
        case 'text':
          addStringAsHtml(el, x.text)
          break

        case 'gap':
          const dropdownEl = new libxml.Element(doc, 'e:dropdown-answer')

          x.options.forEach(option => {
            addStringAsHtml(
              dropdownEl.node('e:dropdown-answer-option').attr({ score: String(option.correct ? singleScore : 0) }),
              option.text
            )
          })

          // without an added space dropdown elements would be drawn
          // too tightly next to each other
          el.addChild(new libxml.Text(doc, ' '))
          el.addChild(dropdownEl)
          el.addChild(new libxml.Text(doc, ' '))
          break

        default:
          const _: never = x
          return _
      }
    })

    return el
  }

  const buildChoiceGroupQuestion = (question: ExamChoiceGroupQuestion) => {
    const el = new libxml.Element(doc, 'e:question')

    addStringAsHtml(el.node('e:question-title'), 'Monivalintatehtävä / flervalsuppgift')
    addStringAsHtml(el.node('e:question-instruction'), question.text)

    question.choices.forEach(choice => {
      const choiceEl = new libxml.Element(doc, 'e:question')

      addStringAsHtml(choiceEl.node('e:question-title'), '')
      addStringAsHtml(choiceEl.node('e:question-instruction'), choice.text)

      const answerEl = new libxml.Element(doc, 'e:choice-answer')

      choice.options.forEach(option => {
        addStringAsHtml(
          answerEl
            .node('e:choice-answer-option')
            .attr({ score: String(option.correct ? Math.floor(question.maxScore! / question.choices.length) : 0) }),
          option.text
        )
      })

      choiceEl.addChild(answerEl)
      el.addChild(choiceEl)

      if (choice.breakAfter) {
        el.node('div', '***').attr({ class: 'e-font-size-xl e-mrg-y-4 e-color-link' })
      }
    })

    return el
  }

  const buildTextQuestion = (question: ExamTextQuestion) => {
    const el = new libxml.Element(doc, 'e:question')

    addStringAsHtml(el.node('e:question-title'), 'Tekstitehtävä / textuppgift')
    addStringAsHtml(el.node('e:question-instruction'), question.text)

    el.node('e:text-answer').attr({
      type: question.screenshotExpected ? 'rich-text' : 'multi-line',
      'max-score': String(question.maxScore)
    })

    return el
  }

  const buildQuestion = (question: ExamQuestion) => {
    switch (question.type) {
      case 'text':
        return buildTextQuestion(question)

      case 'choicegroup':
        return buildChoiceGroupQuestion(question)

      case 'multichoicegap':
        return buildMultiChoiceGapQuestion(question)

      default:
        throw new Error(`Unsupported question type '${question.type}'`)
    }
  }

  const buildSection = (section: ExamSection) => {
    const el = new libxml.Element(doc, 'e:section')

    if (section.casForbidden) {
      el.attr('cas-forbidden', section.casForbidden.toString())
    }
    if (section.title) {
      addStringAsHtml(el.node('e:section-title'), section.title)
    } else {
      el.node('e:section-title')
    }

    section.questions.forEach(question => question.type !== 'audiotest' && el.addChild(buildQuestion(question)))

    return el
  }

  const getSHA1Hash = function(stringInput: string) {
    return crypto
      .createHash('sha1')
      .update(JSON.stringify(stringInput))
      .digest('hex')
  }

  const buildAttachment = (attachment: Attachment) => {
    const el = new libxml.Element(doc, 'e:attachment')
    // name is required to add a reference to attachments page
    el.attr('name', getSHA1Hash(attachment.filename))
    el.node('e:attachment-title', attachment.filename)
    el.node(`e:${attachment.type}`).attr('src', attachment.filename)

    return el
  }

  const buildExternalMaterial = (attachments: Attachment[]) => {
    const el = new libxml.Element(doc, 'e:external-material')
    Object.keys(attachments).forEach((_, idx) => {
      el.addChild(buildAttachment(attachments[idx]))
    })

    return el
  }

  const doc = new libxml.Document()

  const root = doc.node('e:exam')

  root.attr({
    'exam-schema-version': '0.1'
  })

  root.defineNamespace('http://www.w3.org/1999/xhtml')
  root.defineNamespace('e', 'http://ylioppilastutkinto.fi/exam.xsd')
  root.node('e:languages').node('e:language', 'fi-FI')

  addStringAsHtml(root.node('e:exam-title'), examContent.title)

  addStringAsHtml(root.node('e:exam-instruction'), examContent.instruction)
  root.addChild(new libxml.Element(doc, 'e:table-of-contents'))

  if (hasAttachments(attachments)) {
    root.addChild(buildExternalMaterial(attachments))
  }

  examContent.sections.forEach(section => root.addChild(buildSection(section)))
  return doc.toString(false)
}

const hasAttachments = (attachments: Attachment[]) => attachments && Object.keys(attachments).length > 0
