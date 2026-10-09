import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';

/* ───── Types ───── */
interface Usuario {
    id: number; correoUtec: string; nombres: string; apellidos: string;
    nombreCompleto: string; rol: string; cargo?: string; activo: boolean;
    laboratoriosAsignados?: string[];
}
interface Lab { id: number; nombre: string; codigoLab: string; }

const ROLES = ['ADMIN', 'COORDINADOR', 'DIRECTOR', 'RESPONSABLE_LAB', 'DOCENCIA', 'ESTUDIANTE'];

const rolColor: Record<string, string> = {
    ADMIN: 'bg-red-100 text-red-800',
    COORDINADOR: 'bg-blue-100 text-blue-800', DIRECTOR: 'bg-amber-100 text-amber-800',
    RESPONSABLE_LAB: 'bg-green-100 text-green-800', DOCENCIA: 'bg-indigo-100 text-indigo-800',
    ESTUDIANTE: 'bg-gray-100 text-gray-700',
};
function getCargosByRol(rol: string): string[] {
    switch (rol) {
        case 'ADMIN':
            return ['Directora General Académica', 'Administrador de Laboratorios'];
        case 'COORDINADOR':
            return ['Coordinadora de Laboratorios Académicos', 'Coordinador de Laboratorios Académicos'];
        case 'DIRECTOR':
            return [
                'Decano de la Facultad de Ingeniería', 'Decano de la Facultad de Computación', 'Decano de la Facultad de Negocios',
                'Dir. de Proyectos e Infraestructura Académica y Dpto de Física', 'Director de Computer Science',
                'Director de Ingeniería Industrial', 'Director de Ciencias', 'Director de HACS',
                'Director de Planeamiento, Diseño y Gest. Acad.', 'Director del Depto. Acad. de Ing. Mecánica y Energía',
                'Dir. del Depto. Acad. de Ing. Química y Bioingeniería', 'Dir. Depto. Acad. de Ing. Electrónica y Mecatrónica',
                'Dir. Depto. Acad. de Administración y Neg. Digitales', 'Directora de Ciberseguridad',
                'Encargado de Ing. Industrial, Negocios y Gestión',
            ];
        case 'RESPONSABLE_LAB':
            return ['Asistente de Dirección', 'Analista de Proyectos de Innovación', 'Responsable de Laboratorio', 'Técnico de Laboratorio'];
        default:
            return [];
    }
}
/* ───── Main Component ───── */
export default function UsuariosPage() {
    const qc = useQueryClient();
    const [tab, setTab] = useState<'jerarquia' | 'todos'>('jerarquia');
    const [editando, setEditando] = useState<Usuario | null>(null);
    const [nuevoRol, setNuevoRol] = useState('');
    const [nuevoCargo, setNuevoCargo] = useState('');
    const [labsUsuario, setLabsUsuario] = useState<string[]>([]);
    const [dirResponsables, setDirResponsables] = useState<number[]>([]);

    // ─── Queries ───
    const { data: usuarios, isLoading } = useQuery({
        queryKey: ['usuarios'],
        queryFn: () => api.get<{ data: Usuario[] }>('/usuarios'),
        select: (res) => res.data.data,
    });

    const { data: laboratorios } = useQuery({
        queryKey: ['laboratorios-all'],
        queryFn: () => api.get('/laboratorios'),
        select: (res) => res.data.data as Lab[],
    });

    const { data: responsables } = useQuery({
        queryKey: ['responsables-all'],
        queryFn: () => api.get<{ data: Usuario[] }>('/usuarios/responsables'),
        select: (res) => res.data.data,
    });

    // ─── Mutations ───
    const updateMut = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => api.put(`/usuarios/${id}`, data),
        onSuccess: () => { toast.success('Usuario actualizado'); setEditando(null); },
        onError: () => toast.error('Error al actualizar'),
    });

    const desactivarMut = useMutation({
        mutationFn: (id: number) => api.patch(`/usuarios/${id}/desactivar`),
        onSuccess: () => { toast.success('Usuario desactivado'); },
    });

    // ─── Grouped data ───
    const admins = usuarios?.filter(u => u.rol === 'ADMIN') || [];
    const coordinadores = usuarios?.filter(u => u.rol === 'COORDINADOR') || [];
    const directores = usuarios?.filter(u => u.rol === 'DIRECTOR') || [];
    const responsablesLab = usuarios?.filter(u => u.rol === 'RESPONSABLE_LAB') || [];
    const estudiantes = usuarios?.filter(u => u.rol === 'ESTUDIANTE') || [];

    // ─── Edit helpers ───
    const abrirEdicion = async (u: Usuario) => {
        setEditando(u);
        setNuevoRol(u.rol);
        setNuevoCargo(u.cargo || '');
        setLabsUsuario(u.laboratoriosAsignados || []);
        if (u.rol === 'DIRECTOR') {
            try {
                const res = await api.get<{ data: Usuario[] }>(`/usuarios/por-director/${u.id}`);
                setDirResponsables(res.data.data.map(r => r.id));
            } catch { setDirResponsables([]); }
        } else {
            setDirResponsables([]);
        }
    };

    const guardarEdicion = () => {
        if (!editando) return;
        // Ids reales de la tabla roles (ADMIN=2 … ESTUDIANTE=6; SUPER_ADMIN=1 ya no existe)
        const ROLE_ID: Record<string, number> = { ADMIN: 2, COORDINADOR: 3, DIRECTOR: 4, RESPONSABLE_LAB: 5, ESTUDIANTE: 6 };
        const rolId = ROLE_ID[nuevoRol];
        updateMut.mutate({ id: editando.id, data: { rolId, cargo: nuevoCargo || null } });
    };

    const toggleLab = async (lab: Lab) => {
        if (!editando) return;
        const labKey = `${lab.codigoLab} - ${lab.nombre}`;
        const asignado = labsUsuario.includes(labKey);
        const isDirector = nuevoRol === 'DIRECTOR';
        const url = isDirector
            ? `/usuarios/${editando.id}/labs-dirige/${lab.id}`
            : `/usuarios/${editando.id}/laboratorios/${lab.id}`;
        try {
            if (asignado) {
                await api.delete(url);
                setLabsUsuario(prev => prev.filter(l => l !== labKey));
                toast.success(`${lab.codigoLab} quitado`);
            } else {
                await api.post(url);
                setLabsUsuario(prev => [...prev, labKey]);
                toast.success(`${lab.codigoLab} asignado`);
            }
            qc.invalidateQueries();
        } catch { toast.error('Error al modificar asignación'); }
    };

    const toggleResponsable = async (resp: Usuario) => {
        if (!editando) return;
        const asignado = dirResponsables.includes(resp.id);
        try {
            if (asignado) {
                await api.delete(`/usuarios/${editando.id}/responsables/${resp.id}`);
                setDirResponsables(prev => prev.filter(id => id !== resp.id));
                toast.success(`${resp.nombreCompleto} quitado`);
            } else {
                await api.post(`/usuarios/${editando.id}/responsables/${resp.id}`);
                setDirResponsables(prev => [...prev, resp.id]);
                toast.success(`${resp.nombreCompleto} asignado`);
            }
            qc.invalidateQueries();
        } catch { toast.error('Error al modificar asignación'); }
    };

    if (isLoading) return <div className="text-center py-12 text-utec-gray-200">Cargando usuarios...</div>;

    return (
        <div>
            {/* Header */}
            <PageHeader
                title="Gestión de Usuarios"
                subtitle={`${usuarios?.length ?? 0} usuarios registrados`}
                actions={
                    <div className="flex bg-utec-gray-50 rounded-lg p-1 border border-utec-gray-100">
                        <button onClick={() => setTab('jerarquia')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'jerarquia' ? 'bg-utec-cyan text-white' : 'text-utec-gray-200 hover:text-utec-dark'}`}>
                            Organigrama
                        </button>
                        <button onClick={() => setTab('todos')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'todos' ? 'bg-utec-cyan text-white' : 'text-utec-gray-200 hover:text-utec-dark'}`}>
                            Todos
                        </button>
                    </div>
                }
            />

            {tab === 'jerarquia' ? (
                <div className="space-y-6">
                    {/* Administración */}
                    <SectionCard title="Dirección General Académica" count={admins.length} color="red">
                        {admins.map(u => <UserRow key={u.id} u={u} onEdit={() => abrirEdicion(u)} />)}
                    </SectionCard>

                    {/* Coordinación */}
                    <SectionCard title="Coordinación de Laboratorios" count={coordinadores.length} color="blue">
                        {coordinadores.map(u => <UserRow key={u.id} u={u} onEdit={() => abrirEdicion(u)} />)}
                    </SectionCard>

                    {/* Directores */}
                    <SectionCard title="Directores" count={directores.length} color="amber">
                        {directores.map(u => (
                            <div key={u.id} className="border-b border-utec-gray-50 last:border-0 py-3">
                                <UserRow u={u} onEdit={() => abrirEdicion(u)} />
                                {/* Labs que dirige */}
                                {u.laboratoriosAsignados && u.laboratoriosAsignados.length > 0 && (
                                    <div className="ml-14 mt-2 flex flex-wrap gap-1">
                                        <span className="text-[10px] text-utec-gray-200 mr-1 self-center">Dirige:</span>
                                        {u.laboratoriosAsignados.map((lab, i) => (
                                            <span key={i} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{lab}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </SectionCard>

                    {/* Responsables */}
                    <SectionCard title="Responsables de Laboratorio" count={responsablesLab.length} color="green">
                        {responsablesLab.map(u => (
                            <div key={u.id} className="border-b border-utec-gray-50 last:border-0 py-3">
                                <UserRow u={u} onEdit={() => abrirEdicion(u)} />
                                {u.laboratoriosAsignados && u.laboratoriosAsignados.length > 0 && (
                                    <div className="ml-14 mt-2 flex flex-wrap gap-1">
                                        <span className="text-[10px] text-utec-gray-200 mr-1 self-center">Asignado a:</span>
                                        {u.laboratoriosAsignados.map((lab, i) => (
                                            <span key={i} className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{lab}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </SectionCard>

                    {/* Estudiantes */}
                    <SectionCard title="Estudiantes" count={estudiantes.length} color="gray">
                        {estudiantes.map(u => <UserRow key={u.id} u={u} onEdit={() => abrirEdicion(u)} />)}
                        {estudiantes.length === 0 && (
                            <p className="text-sm text-utec-gray-200 text-center py-4">Los estudiantes se registran automáticamente al iniciar sesión con Google</p>
                        )}
                    </SectionCard>
                </div>
            ) : (
                /* ─── Tabla completa ─── */
                <div className="bg-white rounded-xl border border-utec-gray-100 overflow-hidden">
                    <table className="w-full">
                        <thead>
                        <tr className="bg-utec-gray-50 border-b border-utec-gray-100">
                            <th className="text-left px-4 py-3 text-xs font-medium text-utec-gray-200 uppercase">Usuario</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-utec-gray-200 uppercase">Correo</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-utec-gray-200 uppercase">Rol</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-utec-gray-200 uppercase">Cargo / Labs</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-utec-gray-200 uppercase">Estado</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-utec-gray-200 uppercase">Acciones</th>
                        </tr>
                        </thead>
                        <tbody>
                        {usuarios?.map(u => (
                            <tr key={u.id} className="border-b border-utec-gray-100 hover:bg-utec-gray-50 transition-colors">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <Avatar u={u} />
                                        <span className="font-medium text-sm text-utec-dark">{u.nombreCompleto}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-utec-gray-200">{u.correoUtec}</td>
                                <td className="px-4 py-3"><RolBadge rol={u.rol} /></td>
                                <td className="px-4 py-3 text-sm text-utec-gray-200">
                                    {u.cargo || '—'}
                                    {u.laboratoriosAsignados && u.laboratoriosAsignados.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {u.laboratoriosAsignados.map((lab, i) => (
                                                <span key={i} className="text-[10px] bg-utec-cyan/10 text-utec-cyan px-2 py-0.5 rounded">{lab}</span>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button onClick={() => abrirEdicion(u)} className="text-xs text-utec-cyan hover:text-utec-blue font-medium mr-3">Editar</button>
                                    {u.activo && (
                                        <button onClick={() => { if (confirm(`¿Desactivar a ${u.nombreCompleto}?`)) desactivarMut.mutate(u.id); }}
                                                className="text-xs text-red-500 hover:text-red-700 font-medium">Desactivar</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ─── Modal Edición ─── */}
            {editando && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <Avatar u={editando} size="lg" />
                            <div>
                                <h3 className="text-lg font-bold text-utec-dark">{editando.nombreCompleto}</h3>
                                <p className="text-sm text-utec-gray-200">{editando.correoUtec}</p>
                            </div>
                        </div>

                        <div className="space-y-5">
                            {/* Rol y Cargo */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Rol</label>
                                    <select value={nuevoRol} onChange={e => setNuevoRol(e.target.value)} className="input-field">
                                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-1">Cargo</label>
                                    <select value={nuevoCargo} onChange={(e) => setNuevoCargo(e.target.value)} className="input-field">
                                        <option value="">— Seleccionar cargo —</option>
                                        {getCargosByRol(nuevoRol).map(c => <option key={c} value={c}>{c}</option>)}
                                        <option value="">— Escribir otro —</option>
                                    </select>
                                    {!getCargosByRol(nuevoRol).includes(nuevoCargo) && (
                                        <input type="text" value={nuevoCargo} onChange={(e) => setNuevoCargo(e.target.value)} placeholder="Cargo personalizado" className="input-field mt-2" />
                                    )}
                                </div>
                            </div>

                            {/* Labs — para DIRECTOR */}
                            {nuevoRol === 'DIRECTOR' && laboratorios && (
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-2">Laboratorios que dirige</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {laboratorios.map(lab => {
                                            const labKey = `${lab.codigoLab} - ${lab.nombre}`;
                                            const asignado = labsUsuario.includes(labKey);
                                            return (
                                                <button key={lab.id} type="button" onClick={() => toggleLab(lab)}
                                                        className={`p-2 rounded-lg text-xs font-medium text-left transition-all border ${asignado ? 'bg-amber-50 border-amber-400 text-utec-dark' : 'bg-white border-utec-gray-100 text-utec-gray-200 hover:border-amber-300'}`}>
                                                    <span className="font-bold">{lab.codigoLab}</span><br />
                                                    <span className="text-[10px]">{lab.nombre}</span>
                                                    {asignado && <Check size={13} className="inline text-amber-600 ml-1 align-[-2px]" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Responsables — para DIRECTOR */}
                            {nuevoRol === 'DIRECTOR' && responsables && (
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-2">Responsables asignados</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {responsables.map(resp => {
                                            const asignado = dirResponsables.includes(resp.id);
                                            return (
                                                <button key={resp.id} type="button" onClick={() => toggleResponsable(resp)}
                                                        className={`p-2 rounded-lg text-xs font-medium text-left transition-all border ${asignado ? 'bg-green-50 border-green-400 text-utec-dark' : 'bg-white border-utec-gray-100 text-utec-gray-200 hover:border-green-300'}`}>
                                                    <span className="font-bold">{resp.nombreCompleto}</span><br />
                                                    <span className="text-[10px]">{resp.correoUtec}</span>
                                                    {asignado && <Check size={13} className="inline text-green-600 ml-1 align-[-2px]" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Labs — para RESPONSABLE_LAB */}
                            {nuevoRol === 'RESPONSABLE_LAB' && laboratorios && (
                                <div>
                                    <label className="block text-sm font-medium text-utec-dark mb-2">Laboratorios asignados</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {laboratorios.map(lab => {
                                            const labKey = `${lab.codigoLab} - ${lab.nombre}`;
                                            const asignado = labsUsuario.includes(labKey);
                                            return (
                                                <button key={lab.id} type="button" onClick={() => toggleLab(lab)}
                                                        className={`p-2 rounded-lg text-xs font-medium text-left transition-all border ${asignado ? 'bg-utec-cyan/10 border-utec-cyan text-utec-dark' : 'bg-white border-utec-gray-100 text-utec-gray-200 hover:border-utec-cyan'}`}>
                                                    <span className="font-bold">{lab.codigoLab}</span><br />
                                                    <span className="text-[10px]">{lab.nombre}</span>
                                                    {asignado && <Check size={13} className="inline text-utec-cyan ml-1 align-[-2px]" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setEditando(null)} className="btn-secondary text-sm">Cancelar</button>
                            <button onClick={guardarEdicion} disabled={updateMut.isPending} className="btn-primary text-sm">
                                {updateMut.isPending ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ───── Sub-components ───── */
function SectionCard({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
    const colors: Record<string, string> = {
        red: 'border-l-red-500', blue: 'border-l-blue-500', amber: 'border-l-amber-500',
        green: 'border-l-green-500', gray: 'border-l-gray-400',
    };
    return (
        <div className={`bg-white rounded-xl border border-utec-gray-100 border-l-4 ${colors[color]} overflow-hidden`}>
            <div className="px-5 py-3 bg-utec-gray-50 border-b border-utec-gray-100 flex items-center justify-between">
                <h2 className="font-display font-bold text-utec-dark text-sm">{title}</h2>
                <span className="text-xs text-utec-gray-200 bg-white px-2 py-0.5 rounded-full">{count}</span>
            </div>
            <div className="px-5 divide-y divide-utec-gray-50">{children}</div>
        </div>
    );
}

function UserRow({ u, onEdit }: { u: Usuario; onEdit: () => void }) {
    return (
        <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
                <Avatar u={u} />
                <div>
                    <p className="text-sm font-medium text-utec-dark">{u.nombreCompleto}</p>
                    <p className="text-xs text-utec-gray-200">{u.cargo || u.correoUtec}</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <RolBadge rol={u.rol} />
                <button onClick={onEdit} className="text-xs text-utec-cyan hover:text-utec-blue font-medium">Editar</button>
            </div>
        </div>
    );
}

function Avatar({ u, size }: { u: Usuario; size?: 'lg' }) {
    const s = size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
    return (
        <div className={`${s} rounded-full bg-utec-cyan/10 text-utec-cyan flex items-center justify-center font-bold`}>
            {u.nombres[0]}{u.apellidos[0]}
        </div>
    );
}

function RolBadge({ rol }: { rol: string }) {
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${rolColor[rol] || 'bg-gray-100 text-gray-700'}`}>{rol}</span>;
}