/**
 * YAML Utilities
 * 
 * Wrapper around js-yaml for YAML parsing/dumping.
 * 
 * @module utils/yaml-utils
 */

const yaml = require('js-yaml');
const fileUtils = require('./file-utils');

/**
 * Parse YAML string
 * 
 * @param {string} yamlString - YAML string
 * @returns {Object}
 */
function parse(yamlString) {
  return yaml.load(yamlString);
}

/**
 * Dump object to YAML string
 * 
 * @param {Object} obj - Object to dump
 * @returns {string}
 */
function dump(obj) {
  return yaml.dump(obj, {
    indent: 2,
    lineWidth: -1
  });
}

/**
 * Read YAML file
 * 
 * @param {string} filePath - YAML file path
 * @returns {Promise<Object>}
 */
async function readYAML(filePath) {
  const content = await fileUtils.readFile(filePath);
  return parse(content);
}

/**
 * Write YAML file
 * 
 * @param {string} filePath - YAML file path
 * @param {Object} data - Data to write
 * @returns {Promise<void>}
 */
async function writeYAML(filePath, data) {
  const yamlString = dump(data);
  await fileUtils.writeFile(filePath, yamlString);
}

/**
 * Extract YAML frontmatter from markdown
 * 
 * @param {string} markdownContent - Markdown content
 * @returns {{frontmatter: Object | null, content: string}}
 */
function extractFrontmatter(markdownContent) {
  const frontmatterRegex = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/;
  const match = markdownContent.match(frontmatterRegex);
  
  if (!match) {
    return {
      frontmatter: null,
      content: markdownContent
    };
  }
  
  return {
    frontmatter: parse(match[1]),
    content: match[2]
  };
}

module.exports = {
  parse,
  dump,
  readYAML,
  writeYAML,
  extractFrontmatter
};
