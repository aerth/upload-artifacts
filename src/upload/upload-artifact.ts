import * as core from '@actions/core'
import artifact, {
  UploadArtifactOptions,
  ArtifactNotFoundError
} from '@actions/artifact'
import {findFilesToUpload} from '../shared/search'
import {getInputs} from './input-helper'
import {NoFileOptions} from './constants'
import {uploadArtifact} from '../shared/upload-artifact'

async function deleteArtifactIfExists(artifactName: string): Promise<void> {
  try {
    await artifact.deleteArtifact(artifactName)
  } catch (error) {
    if (error instanceof ArtifactNotFoundError) {
      core.debug(`Skipping deletion of '${artifactName}', it does not exist`)
      return
    }

    // Best effort, we don't want to fail the action if this fails
    core.debug(`Unable to delete artifact: ${(error as Error).message}`)
  }
}

export async function run(): Promise<void> {
  const inputs = getInputs()
  const searchResult = await findFilesToUpload(
    inputs.searchPath,
    inputs.includeHiddenFiles
  )
  if (searchResult.filesToUpload.length === 0) {
    // No files were found, different use cases warrant different types of behavior if nothing is found
    let warnfn = (inputs.ifNoFilesFound == NoFileOptions.warn) ? core.warning : (inputs.ifNoFilesFound == NoFileOptions.error) ? core.setFailed : core.info
    warnfn(`No files were found with the provided path: ${inputs.searchPath}. No artifacts will be uploaded.`)
    return
  } 
  const s = searchResult.filesToUpload.length === 1 ? '' : 's'
  core.info(
    `With the provided path, there will be ${searchResult.filesToUpload.length} file${s} uploaded`
  )
  core.debug(`Root artifact directory is ${searchResult.rootDirectory}`)

  if (inputs.overwrite) {
    await deleteArtifactIfExists(inputs.artifactName)
  }

  const options: UploadArtifactOptions = {}
  if (inputs.retentionDays) {
    options.retentionDays = inputs.retentionDays
  }

  if (typeof inputs.compressionLevel !== 'undefined') {
    options.compressionLevel = inputs.compressionLevel
  }
  if (searchResult.filesToUpload.length === 1) {
    core.info("uploading one file")
    await uploadArtifact(
      inputs.artifactName,
      searchResult.filesToUpload,
      searchResult.rootDirectory,
      options
    )
  } else {
    core.info("uploading " + searchResult.filesToUpload.length + " files")
    const promises = searchResult.filesToUpload.map(file =>
      uploadArtifact(
        `${file.replace(searchResult.rootDirectory, '').replace(/^\//, '')}`,
        [file],
        searchResult.rootDirectory,
        options
      )
    )
    await Promise.all(promises)
  }
  core.info(`cool`)
  
}
