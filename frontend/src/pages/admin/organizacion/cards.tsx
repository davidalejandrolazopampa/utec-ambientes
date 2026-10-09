import { useMemo, useState } from 'react';
import { ChevronRight, Pencil, Trash2, GraduationCap, Briefcase, Wrench, Check, X, FolderOpen, FlaskConical } from 'lucide-react';
import type { Departamento, Facultad, Lab, Usuario } from './types';

/* Botón de acción chico (editar/eliminar) con target táctil decente y hover claro.
   Se usa igual en FacultadCard y DepCard para que las acciones estén SIEMPRE en el
   mismo sitio (columna derecha) y con el mismo aspecto. */
function IconBtn({ title, danger, onClick, children }: { title: string; danger?: boolean; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick} title={title} aria-label={title}
                className={`p-1.5 rounded-md text-utec-gray-200 transition-colors cursor-pointer ${danger ? 'hover:text-red-500 hover:bg-red-50' : 'hover:text-utec-cyan hover:bg-utec-cyan/10'}`}>
            {children}
        </button>
    );
}

/* ═══ FacultadCard (colapsable) — nivel 1 de la jerarquía ═══
   Anatomía fija: [chevron] [pill de nivel + nombre + líder] ....... [conteo] [acciones]
   El mismo patrón se repite en DepCard (nivel 2) para que la página se lea igual en
   todos los niveles: qué es (pill), cómo se llama, quién lo lidera, cuánto contiene. */
export function FacultadCard({ f, expanded, onToggle, deps, decano, usuariosMap, usuariosPorNombre, labsPorDepto, onClickLab, onClickPersona, onAsignarDecano, onAsignarDirector, onEditar, onEliminar, onEditarDep, onEliminarDep }: {
    f: Facultad; expanded: boolean; onToggle: () => void; deps: Departamento[]; decano?: Usuario;
    usuariosMap: Map<number, Usuario>; usuariosPorNombre: Map<string, Usuario>; labsPorDepto: Map<number, Lab[]>;
    onClickLab: (l: Lab) => void; onClickPersona: (u: Usuario) => void;
    onAsignarDecano: () => void; onAsignarDirector: (d: Departamento) => void;
    onEditar: () => void; onEliminar: () => void; onEditarDep: (d: Departamento) => void; onEliminarDep: (d: Departamento) => void;
}) {
    // Una DIRECCION (área administrativa) NO tiene decano: su líder es un director/a.
    const esDireccion = f.tipo === 'DIRECCION';
    const liderLabel = esDireccion ? 'Director/a' : 'Decano/a';
    return (
        <div className="bg-white rounded-xl border border-utec-gray-100 overflow-hidden transition-shadow hover:shadow-sm">
            <div onClick={onToggle} className="cursor-pointer px-4 py-3 flex items-center gap-3 hover:bg-utec-cyan/[0.04] transition-colors">
                <ChevronRight size={16} className={`text-utec-cyan flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${esDireccion ? 'text-purple-600 bg-purple-50 border-purple-200' : 'text-utec-cyan bg-utec-cyan/10 border-utec-cyan/20'}`}>
                            {esDireccion ? 'Dirección' : 'Facultad'}
                        </span>
                        <h3 className="text-sm font-bold text-utec-dark truncate">{f.nombre}</h3>
                    </div>
                    {decano ? (
                        <p className="text-xs text-utec-gray-200 mt-1">
                            <GraduationCap size={12} className="inline align-[-1px] text-utec-cyan" /> {liderLabel}: <strong onClick={e => { e.stopPropagation(); onClickPersona(decano); }} className="text-utec-dark hover:text-utec-cyan hover:underline cursor-pointer">{decano.nombreCompleto}</strong>
                            <button onClick={e => { e.stopPropagation(); onAsignarDecano(); }} className="ml-2 text-utec-cyan hover:underline cursor-pointer">Cambiar</button>
                        </p>
                    ) : (
                        <button onClick={e => { e.stopPropagation(); onAsignarDecano(); }} className="text-xs text-utec-cyan hover:underline mt-1 cursor-pointer">+ Asignar {liderLabel.toLowerCase()}</button>
                    )}
                </div>
                <span className="text-[11px] bg-utec-gray-50 text-utec-gray-200 border border-utec-gray-100 px-2 py-1 rounded-lg font-medium flex-shrink-0 tabular-nums">
                    <FolderOpen size={11} className="inline align-[-1px] mr-1" />{deps.length} dpto{deps.length === 1 ? '' : 's'}
                </span>
                <div className="flex items-center flex-shrink-0 -mr-1">
                    <IconBtn title={esDireccion ? 'Editar dirección' : 'Editar facultad'} onClick={e => { e.stopPropagation(); onEditar(); }}><Pencil size={13} /></IconBtn>
                    <IconBtn title={esDireccion ? 'Eliminar dirección' : 'Eliminar facultad'} danger onClick={e => { e.stopPropagation(); onEliminar(); }}><Trash2 size={13} /></IconBtn>
                </div>
            </div>
            {expanded && (
                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-utec-gray-50">
                    {deps.map(d => <DepCard key={d.id} d={d} dir={d.directorId ? usuariosMap.get(d.directorId) : undefined} usuariosPorNombre={usuariosPorNombre} labs={labsPorDepto.get(d.id) ?? []} onClickLab={onClickLab} onClickPersona={onClickPersona} onAsignarDirector={() => onAsignarDirector(d)} onEditar={() => onEditarDep(d)} onEliminar={() => onEliminarDep(d)} />)}
                    {deps.length === 0 && <p className="text-xs text-utec-gray-200 italic py-2 px-3">Sin departamentos — crea uno con "+ Departamento" y asígnale esta {esDireccion ? 'dirección' : 'facultad'}.</p>}
                </div>
            )}
        </div>
    );
}

/* ═══ DepCard (colapsable, estado local) — nivel 2: departamento con sus labs ═══ */
export function DepCard({ d, dir, usuariosPorNombre, labs, onClickLab, onClickPersona, onAsignarDirector, onEditar, onEliminar }: {
    d: Departamento; dir?: Usuario; usuariosPorNombre: Map<string, Usuario>; labs: Lab[];
    onClickLab: (l: Lab) => void; onClickPersona: (u: Usuario) => void; onAsignarDirector: () => void;
    onEditar?: () => void; onEliminar?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const responsablesUnicos = useMemo(() => {
        const set = new Map<number, Usuario>();
        labs.forEach(l => (l.responsables ?? []).forEach(n => { const u = usuariosPorNombre.get(n); if (u) set.set(u.id, u); }));
        return [...set.values()];
    }, [labs, usuariosPorNombre]);

    return (
        <div className="bg-utec-gray-50 rounded-lg border border-utec-gray-100/60">
            <div onClick={() => setOpen(o => !o)} className="cursor-pointer px-3 py-2.5 flex items-center gap-2.5 hover:bg-utec-gray-100/60 rounded-lg transition-colors">
                <ChevronRight size={14} className={`text-utec-gray-200 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border text-amber-600 bg-amber-50 border-amber-200">Dpto</span>
                        <p className="text-xs font-bold text-utec-dark truncate">{d.nombre}</p>
                    </div>
                    {dir ? (
                        <p className="text-[11px] text-utec-gray-200 mt-0.5">
                            <Briefcase size={11} className="inline align-[-1px] text-amber-600" /> Director/a: <strong onClick={e => { e.stopPropagation(); onClickPersona(dir); }} className="text-utec-dark hover:text-utec-cyan hover:underline cursor-pointer">{dir.nombreCompleto}</strong>
                            <button onClick={e => { e.stopPropagation(); onAsignarDirector(); }} className="ml-2 text-utec-cyan hover:underline cursor-pointer">Cambiar</button>
                        </p>
                    ) : (
                        <button onClick={e => { e.stopPropagation(); onAsignarDirector(); }} className="text-[11px] text-utec-cyan hover:underline mt-0.5 cursor-pointer">+ Asignar director/a</button>
                    )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] bg-utec-cyan/10 text-utec-cyan px-2 py-0.5 rounded-full font-medium tabular-nums"><FlaskConical size={10} className="inline align-[-1px] mr-0.5" />{labs.length}</span>
                    <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-medium tabular-nums"><Wrench size={10} className="inline align-[-1px] mr-0.5" />{responsablesUnicos.length}</span>
                </div>
                <div className="flex items-center flex-shrink-0 -mr-1">
                    {onEditar && <IconBtn title="Editar departamento" onClick={e => { e.stopPropagation(); onEditar(); }}><Pencil size={12} /></IconBtn>}
                    {onEliminar && <IconBtn title="Eliminar departamento" danger onClick={e => { e.stopPropagation(); onEliminar(); }}><Trash2 size={12} /></IconBtn>}
                </div>
            </div>
            {open && (
                <div className="px-3 pb-3">
                    {responsablesUnicos.length > 0 && (
                        <div className="mb-2">
                            <p className="text-[10px] font-semibold text-utec-gray-200 uppercase tracking-wide mb-1">Responsables de los labs</p>
                            <div className="flex flex-wrap gap-1">
                                {responsablesUnicos.map(r => <button key={r.id} onClick={e => { e.stopPropagation(); onClickPersona(r); }} className="text-[10px] bg-green-50 text-green-700 px-2 py-1 rounded-full hover:bg-green-100 transition-colors cursor-pointer"><Wrench size={11} className="inline align-[-1px]" /> {r.nombreCompleto}</button>)}
                            </div>
                        </div>
                    )}
                    {labs.length > 0 ? (
                        <>
                            <p className="text-[10px] font-semibold text-utec-gray-200 uppercase tracking-wide mb-1">Laboratorios ({labs.length}) — clic para gestionar</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {labs.map(l => (
                                    <button key={l.id} onClick={() => onClickLab(l)} className="text-left text-[11px] bg-white border border-utec-gray-100 px-2.5 py-2 rounded-lg hover:border-utec-cyan hover:shadow-sm transition-all cursor-pointer">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate"><span className="font-bold text-utec-cyan">{l.codigoLab}</span> <span className="text-utec-dark">{l.nombre}</span></span>
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${l.estado === 'ACTIVO' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`} title={l.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}>{l.estado === 'ACTIVO' ? <Check size={11} /> : <X size={11} />}</span>
                                        </div>
                                        {l.responsables && l.responsables.length > 0 && <p className="text-[10px] text-green-600 mt-0.5 truncate"><Wrench size={10} className="inline align-[-1px]" /> {l.responsables.join(', ')}</p>}
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : <p className="text-[10px] text-utec-gray-200 italic">Sin laboratorios</p>}
                </div>
            )}
        </div>
    );
}
