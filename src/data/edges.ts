// Thin typed pass-throughs to the universal-relations (edges) IPC surface.
const e = () => window.wist.edges

export const relatedEdges: typeof window.wist.edges.related = (...a) => e().related(...a)
export const searchEdges: typeof window.wist.edges.search = (...a) => e().search(...a)
export const linkEdge: typeof window.wist.edges.link = (...a) => e().link(...a)
export const unlinkEdge: typeof window.wist.edges.unlink = (id) => e().unlink(id)
export const listAllEdges: typeof window.wist.edges.listAll = () => e().listAll()
