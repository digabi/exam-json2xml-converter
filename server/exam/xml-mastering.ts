const { logger } = require('../logger')
import { masterExam, MasteringResult } from '@digabi/exam-engine-mastering'
const utils = require('@digabi/js-utils')
const {
  exc: { DataError }
} = utils

const shuffleSecret = 'HCEcBdhB5bjyobeDLOI1PYZgReCiVfBE3RqEFASE6yIn56wgz1zx7cOBScoMSgHR'

export const callExamMastering = async (
  exam: any,
  examXml: any,
  masteringOptions: object,
  attachmentMetadata?: any
): Promise<MasteringResult[]> => {
  // eslint-disable-next-line @typescript-eslint/require-await
  const getMediaMetadata = async (displayName: string, type: 'video' | 'audio' | 'image') => {
    if (attachmentMetadata && attachmentMetadata[displayName]) {
      if (type === 'audio') {
        return { duration: attachmentMetadata[displayName].duration ? attachmentMetadata[displayName].duration : 999 }
      } else {
        return {
          width: attachmentMetadata[displayName].width ? attachmentMetadata[displayName].width : 999,
          height: attachmentMetadata[displayName].height ? attachmentMetadata[displayName].height : 999
        }
      }
    } else {
      // Return default values in order to support XML mastering and content validation without
      // having yet stored the attachments and their metadata.
      return { duration: 999, width: 640, height: 480 }
    }
  }
  const masteringResult = await masterExam(examXml, () => exam.examUuid, getMediaMetadata, masteringOptions)
  if (masteringResult.length > 1) {
    throw new DataError('Abitti does not support creating multi-language exams', 400)
  }
  return masteringResult
}

export const tryXmlMastering = async (exam: any, attachmentMetadata?: any) => {
  try {
    const masteringOptions = { multiChoiceShuffleSecret: shuffleSecret }
    const masteringResult = await callExamMastering(exam, exam.contentXml, masteringOptions, attachmentMetadata)

    const examTitle = masteringResult[0].title
    const gradingStructure = masteringResult[0].gradingStructure

    return {
      xml: masteringResult[0].xml,
      attachments: masteringResult[0].attachments,
      gradingStructure,
      examTitle: examTitle
    }
  } catch (e) {
    logger.warn('XML mastering failed', {
      examUuid: exam.examUuid,
      message: e.toString(),
      ...e
    })

    throw new DataError('XML mastering failed', 400)
  }
}
