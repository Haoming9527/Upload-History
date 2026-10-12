# Upload History compatibility

Upload History targets Chrome 148 and newer. It uses generic file-selection and drop detection rather than a list of platform-specific integrations. A working control on one page does not establish support for every workflow on that platform.

## Coverage by mechanism

| Mechanism                                                                                    | Current scope                                                                                                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard local file inputs                                                                   | Implemented; synthetic browser coverage includes single, multiple, empty, and same-named replacement files.                                         |
| Dynamically inserted inputs                                                                  | Implemented; included in the synthetic fixture suite.                                                                                               |
| Trusted file drag and drop                                                                   | Implemented; tested using a browser-generated file drop in the fixture suite.                                                                       |
| Open and closed shadow roots                                                                 | Implemented with Chrome's DOM API and bounded discovery; fixtures cover both. Extremely dynamic or undiscovered controls may still be missed.       |
| Same-origin and cross-origin frames                                                          | Implemented where Chrome grants access to both the top page and frame; fixture coverage includes both. Restrictive origin settings take precedence. |
| Google Forms local file attachment                                                           | **Manual validation pending.** Use the checklist in [Testing](TESTING.md) on a form you can safely access.                                          |
| Canvas, Moodle, Blackboard, Google Classroom, Microsoft Forms, and other school/form systems | **Manual validation pending for each actual workflow.** These are examples to evaluate, not certified integrations.                                 |
| Cloud pickers and existing Drive/OneDrive references                                         | No general capture guarantee. A remote document reference may never expose a local `File`.                                                          |
| File System Access API and proprietary upload controls                                       | No general guarantee unless they also produce an observed supported event.                                                                          |
| Directory uploads, native apps, mobile Chrome, other browsers                                | Outside the current release scope; do not advertise support.                                                                                        |
| Browser internal pages, restricted store pages, inaccessible/sandboxed frames                | Chrome restrictions may prevent capture.                                                                                                            |
| Incognito                                                                                    | Deliberately disabled.                                                                                                                              |

The automated suite uses synthetic fixtures, not real school accounts or third-party forms. Its permission prompt is pregranted only in a copied test manifest. Native permission behavior and named-platform checks remain manual release gates.

## What a record means

**Copy saved** means the extension finished saving its local copy. **Log only** means metadata was retained without file contents. **Copy not saved** describes a failed copy and its reason. **Saving copy** is incomplete and cannot be downloaded yet.

None of these states confirms that a form was submitted or accepted. Cancelling a form after choosing a file does not remove the local selection record. Replacing a file may leave both selections in history. A site's own upload failure can coexist with a successful local copy.

## Reporting a gap

Record the platform, browser/extension versions, exact upload method, whether the control is embedded, and the displayed archive status. Include a sanitized synthetic reproduction if possible. For school systems, use your own permitted test area and dummy files; do not upload private assignments solely to reproduce a bug. See [Contributing](../CONTRIBUTING.md).
