import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X, Check, Backpack, Building2, GraduationCap, Briefcase, Wrench, FolderOpen, Lightbulb, ArrowRight, Ban } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { ROLES_ADMIN, errMsg, rolInfo } from './types';
import type { Carrera, Departamento, Facultad, Lab, Usuario } from './types';

/* ═══ ModalCrearPersona (alta manual de usuario) ═══ */
export function ModalCrearPersona({ departamentos, onClose }: { departamentos: Departamento[]; onClose: () => void }) {
    const qc = useQueryClient();
    const [tipo, setTipo] = useState<'alumno' | 'administrativo'>('alumno');
    const [nombres, setNombres] = useState('');
    const [apellidos, setApellidos] = useState('');
    const [correo, setCorreo] = useState('');
    const [rol, setRol] = useState('RESPONSABLE_LAB');
    const [cargo, setCargo] = useState('');
    const [departamentoId, setDepartamentoId] = useState('');
    const [carrera, setCarrera] = useState('');

    // El alumno se crea SIEMPRE como ESTUDIANTE; solo el administrativo elige rol/cargo/depto.
    const esAlumno = tipo === 'alumno';
    const rolFinal = esAlumno ? 'ESTUDIANTE' : rol;

    // Carreras oficiales para el dropdown del alumno.
    const { data: carreras } = useQuery({
        queryKey: ['carreras'],
        queryFn: () => api.get<{ data: Carrera[] }>('/estructura/carreras'),
        select: r => r.data.data,
        enabled: esAlumno,
    });

    const correoValido = /^[^@\s]+@utec\.edu\.pe$/i.test(correo.trim());
    const valido = !!nombres.trim() && !!apellidos.trim() && correoValido;

    const mutation = useMutation({
        mutationFn: () => api.post('/usuarios', {
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            correoUtec: correo.trim(),
            rol: rolFinal,
            cargo: esAlumno ? null : (cargo.trim() || null),
            departamentoId: esAlumno || !departamentoId ? null : Number(departamentoId),
            carrera: esAlumno ? (carrera || null) : null,
        }),
        onSuccess: () => { toast.success('Persona creada'); qc.invalidateQueries(); onClose(); },
        onError: (e: unknown) => toast.error(errMsg(e) || 'Error al crear la persona'),
    });

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-utec-dark">Nueva persona</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-utec-gray-100 flex items-center justify-center text-utec-gray-200 text-lg"><X size={16} /></button>
                </div>
                <div className="space-y-3">
                    {/* Tipo de persona: define qué campos se piden y qué rol puede tener */}
                    <div>
                        <label className="block text-xs font-medium text-utec-dark mb-1">Tipo de persona</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setTipo('alumno')}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${esAlumno ? 'bg-utec-cyan text-white border-utec-cyan' : 'bg-white border-gray-200 text-utec-dark hover:border-utec-cyan'}`}>
                                <Backpack size={14} className="inline align-[-2px]" /> Alumno
                            </button>
                            <button type="button" onClick={() => setTipo('administrativo')}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${!esAlumno ? 'bg-utec-cyan text-white border-utec-cyan' : 'bg-white border-gray-200 text-utec-dark hover:border-utec-cyan'}`}>
                                <Building2 size={14} className="inline align-[-2px]" /> Administrativo
                            </button>
                        </div>
                        <p className="text-[11px] text-utec-gray-200 mt-1">
                            {esAlumno ? 'Se registra como Estudiante (sin rol administrativo ni cargo).' : 'Elige un rol administrativo, cargo y departamento.'}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <input type="text" value={nombres} onChange={e => setNombres(e.target.value)} className="input-field" placeholder="Nombres" />
                        <input type="text" value={apellidos} onChange={e => setApellidos(e.target.value)} className="input-field" placeholder="Apellidos" />
                    </div>
                    <div>
                        <input type="email" value={correo} onChange={e => setCorreo(e.target.value)} className="input-field" placeholder="correo@utec.edu.pe" />
                        {!!correo && !correoValido && <p className="text-xs text-red-500 mt-1">Debe ser un correo @utec.edu.pe</p>}
                    </div>
                    {/* Carrera: solo para alumnos */}
                    {esAlumno && (
                        <div>
                            <label className="block text-xs font-medium text-utec-dark mb-1"><GraduationCap size={13} className="inline align-[-2px]" /> Carrera</label>
                            <select value={carrera} onChange={e => setCarrera(e.target.value)} className="input-field">
                                <option value="">— Sin carrera asignada —</option>
                                {carreras?.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                            </select>
                        </div>
                    )}
                    {/* Rol/cargo/departamento: solo para administrativos */}
                    {!esAlumno && (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-utec-dark mb-1">Rol administrativo</label>
                                <select value={rol} onChange={e => setRol(e.target.value)} className="input-field">
                                    {ROLES_ADMIN.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                </select>
                            </div>
                            <input type="text" value={cargo} onChange={e => setCargo(e.target.value)} className="input-field" placeholder="Cargo (opcional)" />
                            <select value={departamentoId} onChange={e => setDepartamentoId(e.target.value)} className="input-field">
                                <option value="">— Sin departamento —</option>
                                {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                            </select>
                        </>
                    )}
                </div>
                <div className="flex justify-end gap-2 mt-5">
                    <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
                    <button onClick={() => mutation.mutate()} disabled={!valido || mutation.isPending} className="btn-primary text-sm disabled:opacity-50">
                        {mutation.isPending ? 'Creando...' : 'Crear'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ═══ ModalCrearEstructura (Facultad / Departamento / Carrera) — crear y editar ═══ */
export function ModalCrearEstructura({ tipo, facultades, departamentos = [], editar, onClose }: {
    tipo: 'facultad' | 'departamento' | 'carrera'; facultades: Facultad[]; departamentos?: Departamento[];
    editar?: { id: number; nombre: string; facultadId?: number; departamentoId?: number; facTipo?: string }; onClose: () => void;
}) {
    const qc = useQueryClient();
    const esEdicion = !!editar;
    const [nombre, setNombre] = useState(editar?.nombre ?? '');
    const [facultadId, setFacultadId] = useState(editar?.facultadId ? String(editar.facultadId) : '');
    const [departamentoId, setDepartamentoId] = useState(editar?.departamentoId ? String(editar.departamentoId) : '');
    const [tipoFac, setTipoFac] = useState(editar?.facTipo ?? 'FACULTAD');
    const segmento = tipo === 'facultad' ? 'facultades' : tipo === 'departamento' ? 'departamentos' : 'carreras';
    // La carrera exige facultad (columna NOT NULL en BD).
    const facultadObligatoria = tipo === 'carrera';

    const mutation = useMutation({
        mutationFn: () => {
            const payload = tipo === 'facultad'
                ? { nombre, tipo: tipoFac }
                : tipo === 'departamento'
                    ? { nombre, facultadId: facultadId ? Number(facultadId) : null }
                    : { nombre, facultadId: facultadId ? Number(facultadId) : null, departamentoId: departamentoId ? Number(departamentoId) : null };
            if (esEdicion) return api.put(`/organizacion/${segmento}/${editar!.id}`, payload);
            return api.post(`/organizacion/${segmento}`, payload);
        },
        onSuccess: () => { toast.success(esEdicion ? 'Cambios guardados' : 'Creado'); qc.invalidateQueries(); onClose(); },
        onError: (e) => toast.error(errMsg(e) || 'Error al guardar'),
    });

    // Departamentos de la facultad elegida (para el select de carrera).
    const depsFacultad = facultadId ? departamentos.filter(d => String(d.facultadId) === facultadId) : departamentos;
    const titulo = `${esEdicion ? 'Editar' : tipo === 'facultad' ? 'Nueva' : 'Nuevo/a'} ${tipo}`;
    const valido = !!nombre.trim() && (!facultadObligatoria || !!facultadId);
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-utec-dark capitalize">{titulo}</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-utec-gray-100 flex items-center justify-center text-utec-gray-200 text-lg"><X size={16} /></button>
                </div>
                <label className="block text-sm font-medium text-utec-dark mb-1">Nombre *</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="input-field w-full mb-3" placeholder={tipo === 'facultad' ? 'FACULTAD DE ...' : tipo === 'departamento' ? 'DEPARTAMENTO DE ...' : 'Ingeniería de ...'} />
                {tipo === 'facultad' && (
                    <div className="mb-3">
                        <label className="block text-sm font-medium text-utec-dark mb-1">Tipo</label>
                        <div className="grid grid-cols-2 gap-2">
                            {([['FACULTAD', 'Facultad', 'Su líder es Decano/a'], ['DIRECCION', 'Dirección / Área', 'Su líder es Director/a']] as const).map(([v, l, sub]) => (
                                <button key={v} type="button" onClick={() => setTipoFac(v)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border text-left ${tipoFac === v ? 'bg-utec-cyan text-white border-utec-cyan' : 'bg-white border-gray-200 text-utec-dark hover:border-utec-cyan'}`}>
                                    {l}<span className={`block text-[10px] font-normal ${tipoFac === v ? 'text-white/80' : 'text-utec-gray-200'}`}>{sub}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {(tipo === 'departamento' || tipo === 'carrera') && (
                    <>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Facultad{facultadObligatoria ? ' *' : ''}</label>
                        <select value={facultadId} onChange={e => { setFacultadId(e.target.value); setDepartamentoId(''); }} className="input-field w-full mb-3">
                            <option value="">— Sin facultad —</option>
                            {facultades.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                        </select>
                    </>
                )}
                {tipo === 'carrera' && (
                    <>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Departamento</label>
                        <select value={departamentoId} onChange={e => setDepartamentoId(e.target.value)} className="input-field w-full mb-3" disabled={!facultadId}>
                            <option value="">— Sin departamento —</option>
                            {depsFacultad.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                        </select>
                    </>
                )}
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
                    <button onClick={() => mutation.mutate()} disabled={!valido || mutation.isPending} className="btn-primary text-sm disabled:opacity-50">{mutation.isPending ? 'Guardando...' : esEdicion ? 'Guardar' : 'Crear'}</button>
                </div>
            </div>
        </div>
    );
}

/* ═══ ModalAsignarPersona (Decano / Director) ═══ */
export function ModalAsignarPersona({ info, candidatos, onClose }: {
    info: { tipo: 'decano' | 'director'; targetId: number; targetNombre: string; actualId?: number; esDireccion?: boolean };
    candidatos: Usuario[]; onClose: () => void;
}) {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const [buscar, setBuscar] = useState('');
    const q = buscar.toLowerCase();
    const filtrados = candidatos.filter(u => !buscar || u.nombreCompleto.toLowerCase().includes(q) || u.correoUtec.toLowerCase().includes(q));
    const endpoint = info.tipo === 'decano' ? `/organizacion/facultades/${info.targetId}` : `/organizacion/departamentos/${info.targetId}`;
    const campo = info.tipo === 'decano' ? 'decanoId' : 'directorId';

    const mut = useMutation({
        mutationFn: (userId: number | null) => api.put(endpoint, { [campo]: userId }),
        onSuccess: () => { toast.success('Puesto actualizado'); qc.invalidateQueries(); onClose(); },
        onError: () => toast.error('Error'),
    });
    // En una DIRECCION el líder es un director/a (no decano), aunque se guarde en facultades.decano_id.
    const puesto = info.tipo === 'decano' ? (info.esDireccion ? 'director/a' : 'decano/a') : 'director/a';
    const confirmarAsignar = async (userId: number | null) => {
        // Asignar es directo (constructivo); solo QUITAR (dejar vacante) pide confirmación.
        if (userId === null) {
            const ok = await confirm({
                title: 'Quitar puesto',
                message: `¿Confirmar quitar el ${puesto} de ${info.targetNombre} (dejar vacante)?`,
                confirmText: 'Quitar', variant: 'danger',
            });
            if (!ok) return;
        }
        mut.mutate(userId);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-utec-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-utec-dark capitalize">Asignar {puesto}</h3>
                        <p className="text-xs text-utec-gray-200">{info.targetNombre}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-utec-gray-100 flex items-center justify-center text-utec-gray-200 text-lg"><X size={16} /></button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto">
                    {info.actualId != null && (
                        <button onClick={() => confirmarAsignar(null)} disabled={mut.isPending} className="w-full text-left text-xs text-red-500 hover:text-red-700 bg-red-50 px-3 py-2 rounded-lg mb-3 disabled:opacity-50"><X size={12} className="inline align-[-1px]" /> Quitar puesto actual (dejar vacante)</button>
                    )}
                    <input type="text" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar persona..." className="input-field text-sm w-full mb-3" />
                    <div className="space-y-1">
                        {filtrados.map(u => {
                            const esActual = u.id === info.actualId;
                            return (
                                <div key={u.id} className={`flex items-center justify-between py-2 px-3 rounded-lg ${esActual ? 'bg-utec-cyan/[0.07] border border-utec-cyan/20' : 'hover:bg-utec-gray-50'}`}>
                                    <div className="min-w-0"><p className="text-sm text-utec-dark font-medium truncate">{u.nombreCompleto}</p><p className="text-[10px] text-utec-gray-200">{u.correoUtec} · {u.rol}</p></div>
                                    {esActual ? <span className="text-xs text-utec-cyan font-bold bg-utec-cyan/10 px-2 py-1 rounded-lg flex-shrink-0"><Check size={11} className="inline align-[-1px]" /> Actual</span>
                                        : <button onClick={() => confirmarAsignar(u.id)} disabled={mut.isPending} className="text-xs font-medium px-3 py-1 rounded-lg bg-utec-cyan/10 text-utec-cyan hover:bg-utec-cyan/20 flex-shrink-0 disabled:opacity-50">Asignar</button>}
                                </div>
                            );
                        })}
                        {filtrados.length === 0 && <p className="text-sm text-utec-gray-200 text-center py-6">Sin resultados</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══ ModalLab (asignación de director / responsables) ═══ */
export function ModalLab({ lab, usuarios, onClose }: { lab: Lab; usuarios: Usuario[]; onClose: () => void }) {
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [buscar, setBuscar] = useState('');
    const [seccion, setSeccion] = useState<'responsable' | 'director'>('responsable');
    const [verTodos, setVerTodos] = useState(false);
    const directores = usuarios.filter(u => ['DIRECTOR', 'ADMIN', 'COORDINADOR'].includes(u.rol));
    const responsables = usuarios.filter(u => u.rol === 'RESPONSABLE_LAB');

    // Si el lab tiene director Y ese director tiene responsables vinculados,
    // mostramos por defecto solo esos (= los del mismo departamento). Si no hay
    // ninguno vinculado, caemos a la lista completa para no dejarla vacía.
    const { data: respsDepto } = useQuery({
        queryKey: ['responsables-por-director', lab.directorId],
        queryFn: () => api.get<{ data: Usuario[] }>(`/usuarios/por-director/${lab.directorId}`).then(r => r.data.data),
        enabled: seccion === 'responsable' && !!lab.directorId,
    });
    const hayRespsDepto = (respsDepto?.length ?? 0) > 0;
    const filtrarPorDepto = seccion === 'responsable' && hayRespsDepto && !verTodos;

    const lista = seccion === 'director'
        ? directores
        : (filtrarPorDepto ? (respsDepto ?? []) : responsables);
    const q = buscar.toLowerCase();
    const filtrados = lista.filter(u => !buscar || u.nombreCompleto.toLowerCase().includes(q) || u.correoUtec.toLowerCase().includes(q));
    const directorUser = lab.directorId ? usuarios.find(u => u.id === lab.directorId) : null;

    const nombreDe = (userId: number) => usuarios.find(u => u.id === userId)?.nombreCompleto ?? 'esta persona';
    // Asignar es constructivo y reversible → acción directa (sin modal de confirmación encima).
    const asignarDirector = async (userId: number) => {
        try { await api.patch(`/laboratorios/${lab.id}/director/${userId}`); toast.success(`${nombreDe(userId)} es director de ${lab.codigoLab} (depto auto-vinculado)`); onClose(); } catch (e) { toast.error(errMsg(e) || 'Error al asignar director'); }
    };
    const asignarResp = async (userId: number) => {
        try { await api.post(`/laboratorios/${lab.id}/responsables/${userId}`); toast.success(`${nombreDe(userId)} es responsable de ${lab.codigoLab} (director y depto auto-vinculados)`); onClose(); } catch (e) { toast.error(errMsg(e) || 'Error al asignar responsable'); }
    };
    const removerResp = async (userId: number) => {
        if (!(await confirm({ title: 'Remover responsable', message: `¿Confirmar remover a ${nombreDe(userId)} de ${lab.codigoLab}?`, confirmText: 'Remover', variant: 'danger' }))) return;
        try { await api.delete(`/laboratorios/${lab.id}/responsables/${userId}`); toast.success('Removido'); onClose(); } catch (e) { toast.error(errMsg(e) || 'Error al remover'); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-utec-gray-100 bg-utec-gray-50">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <span className="text-xs font-bold text-utec-cyan">{lab.codigoLab}</span>
                            <h3 className="text-lg font-bold text-utec-dark">{lab.nombre}</h3>
                            {lab.departamentoNombre && <p className="text-xs text-utec-cyan"><FolderOpen size={12} className="inline align-[-1px]" /> {lab.departamentoNombre}{lab.facultadNombre ? ` · ${lab.facultadNombre}` : ''}</p>}
                            <button onClick={() => navigate(`/laboratorios/${lab.id}`)} className="mt-1.5 text-xs text-utec-cyan hover:text-utec-blue font-medium" title="Editar horario, recursos y equipos en la página del laboratorio">
                                Ver detalle / editar laboratorio <ArrowRight size={12} className="inline align-[-1px]" />
                            </button>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-utec-gray-100 flex items-center justify-center text-utec-gray-200 text-lg"><X size={16} /></button>
                    </div>
                    <p className="text-[10px] text-utec-gray-200 -mt-1 mb-1">Aquí solo asignas <strong>director y responsables</strong>. El horario, recursos y equipos se editan en el detalle del lab.</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                            <p className="text-[10px] text-amber-600 font-bold uppercase mb-1"><Briefcase size={11} className="inline align-[-1px]" /> Director</p>
                            <p className="text-sm text-utec-dark font-medium">{lab.directorNombre || '— Sin asignar'}</p>
                            {directorUser && <p className="text-[10px] text-amber-600">{directorUser.correoUtec}</p>}
                        </div>
                        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                            <p className="text-[10px] text-green-600 font-bold uppercase mb-1"><Wrench size={11} className="inline align-[-1px]" /> Responsable(s)</p>
                            {lab.responsables && lab.responsables.length > 0
                                ? lab.responsables.map((r, i) => { const u = responsables.find(u => u.nombreCompleto === r); return <div key={i}><p className="text-sm text-utec-dark font-medium">{r}</p>{u && <p className="text-[10px] text-green-600">{u.correoUtec}</p>}</div>; })
                                : <p className="text-sm text-red-400 italic">Sin asignar</p>}
                        </div>
                    </div>
                </div>
                <div className="flex">
                    <button onClick={() => { setSeccion('responsable'); setBuscar(''); }} className={`flex-1 py-3 text-sm font-medium text-center transition-all border-b-2 ${seccion === 'responsable' ? 'text-green-700 border-green-500 bg-green-50' : 'text-utec-gray-200 border-transparent hover:text-utec-dark'}`}><Wrench size={13} className="inline align-[-2px]" /> Responsables</button>
                    <button onClick={() => { setSeccion('director'); setBuscar(''); }} className={`flex-1 py-3 text-sm font-medium text-center transition-all border-b-2 ${seccion === 'director' ? 'text-amber-700 border-amber-500 bg-amber-50' : 'text-utec-gray-200 border-transparent hover:text-utec-dark'}`}><Briefcase size={11} className="inline align-[-1px]" /> Director</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {seccion === 'responsable' && lab.responsables && lab.responsables.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs font-bold text-utec-dark mb-2">Asignados actualmente</p>
                            {lab.responsables.map((r, i) => {
                                const user = responsables.find(u => u.nombreCompleto === r);
                                return (
                                    <div key={i} className="flex items-center justify-between py-2 px-3 bg-green-50 rounded-lg mb-1 border border-green-100">
                                        <div><p className="text-sm text-green-800 font-medium">{r}</p>{user && <p className="text-[10px] text-green-600">{user.correoUtec}</p>}</div>
                                        {user && <button onClick={() => removerResp(user.id)} className="text-xs text-red-500 hover:text-red-700 font-medium bg-red-50 px-2 py-1 rounded-lg hover:bg-red-100"><X size={12} className="inline align-[-1px]" /> Remover</button>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <input type="text" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder={`Buscar ${seccion}...`} className="input-field text-sm mb-2 w-full" />
                    {seccion === 'responsable' && lab.directorId && hayRespsDepto && (
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-utec-gray-200">
                                {filtrarPorDepto ? <><FolderOpen size={11} className="inline align-[-1px]" /> Solo responsables del departamento</> : 'Mostrando todos los responsables'}
                            </span>
                            <button onClick={() => setVerTodos(v => !v)} className="text-[10px] font-medium text-utec-cyan hover:underline flex-shrink-0">
                                {filtrarPorDepto ? 'Ver todos' : 'Ver solo del departamento'}
                            </button>
                        </div>
                    )}
                    <p className="text-[10px] text-utec-cyan mb-3"><Lightbulb size={11} className="inline align-[-1px]" /> Al asignar, director y departamento se vinculan automáticamente</p>
                    <div className="space-y-1">
                        {filtrados.filter(u => seccion === 'responsable' ? !lab.responsables?.includes(u.nombreCompleto) : true).map(u => {
                            const esActual = seccion === 'director' && lab.directorId === u.id;
                            return (
                                <div key={u.id} className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${esActual ? 'bg-amber-50 border border-amber-200' : 'hover:bg-utec-gray-50'}`}>
                                    <div className="min-w-0"><p className="text-sm text-utec-dark font-medium truncate">{u.nombreCompleto}</p><p className="text-[10px] text-utec-gray-200">{u.correoUtec}</p></div>
                                    {esActual ? <span className="text-xs text-amber-700 font-bold bg-amber-100 px-2 py-1 rounded-lg flex-shrink-0"><Check size={11} className="inline align-[-1px]" /> Actual</span>
                                        : <button onClick={() => seccion === 'director' ? asignarDirector(u.id) : asignarResp(u.id)} className={`text-xs font-medium px-3 py-1 rounded-lg flex-shrink-0 ${seccion === 'director' ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-green-700 bg-green-50 hover:bg-green-100'}`}>Asignar</button>}
                                </div>
                            );
                        })}
                        {filtrados.filter(u => seccion === 'responsable' ? !lab.responsables?.includes(u.nombreCompleto) : true).length === 0 && <p className="text-sm text-utec-gray-200 text-center py-6">Sin resultados</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══ ModalPersona ═══ */
export function ModalPersona({ persona, onClose }: { persona: Usuario; onClose: () => void }) {
    const [editNombres, setEditNombres] = useState(persona.nombres);
    const [editApellidos, setEditApellidos] = useState(persona.apellidos);
    const [editRol, setEditRol] = useState(persona.rol);
    const [editCargo, setEditCargo] = useState(persona.cargo || '');
    const [editDepto, setEditDepto] = useState<number | ''>(persona.departamentoId ?? '');
    const [editCarrera, setEditCarrera] = useState(persona.carrera || '');
    const [guardando, setGuardando] = useState(false);
    const ri = rolInfo(persona.rol);
    const qc = useQueryClient();
    const confirm = useConfirm();
    // Un alumno (ESTUDIANTE) NO puede convertirse en director/coordinador/etc.: solo se le
    // permite corregir el nombre y su carrera. El rol/cargo/departamento son exclusivos de administrativos.
    const esAlumno = persona.rol === 'ESTUDIANTE';

    // Carreras oficiales (solo se necesitan para el dropdown del alumno).
    const { data: carreras } = useQuery({
        queryKey: ['carreras'],
        queryFn: () => api.get<{ data: Carrera[] }>('/estructura/carreras'),
        select: (r) => r.data.data,
        enabled: esAlumno,
    });

    const { data: departamentos } = useQuery({
        queryKey: ['departamentos'],
        queryFn: () => api.get<{ data: Departamento[] }>('/organizacion/departamentos'),
        select: (r) => r.data.data,
    });

    // Responsables a cargo: solo para quien puede dirigir un depto/lab.
    // Puebla la tabla director_responsables → habilita el filtro "por departamento".
    const esDirector = ['DIRECTOR', 'COORDINADOR', 'ADMIN'].includes(persona.rol);
    const { data: aCargo } = useQuery({
        queryKey: ['responsables-por-director', persona.id],
        queryFn: () => api.get<{ data: Usuario[] }>(`/usuarios/por-director/${persona.id}`).then(r => r.data.data),
        enabled: esDirector,
    });
    // Misma queryKey/forma que el componente padre para compartir cache sin
    // inconsistencias (el padre usa select: r => r.data.data).
    const { data: todosUsuarios } = useQuery({
        queryKey: ['usuarios-administrativos'],
        queryFn: () => api.get<{ data: Usuario[] }>('/usuarios/administrativos'),
        select: (r) => r.data.data,
        enabled: esDirector,
    });
    const [buscarResp, setBuscarResp] = useState('');
    const idsACargo = new Set((aCargo ?? []).map(u => u.id));
    const disponibles = (todosUsuarios ?? [])
        .filter(u => u.rol === 'RESPONSABLE_LAB' && !idsACargo.has(u.id))
        .filter(u => !buscarResp || u.nombreCompleto.toLowerCase().includes(buscarResp.toLowerCase()));

    const vincularResp = async (rid: number) => { try { await api.post(`/usuarios/${persona.id}/responsables/${rid}`); toast.success('Responsable vinculado'); qc.invalidateQueries(); } catch (e) { toast.error(errMsg(e) || 'Error al vincular'); } };
    const desvincularResp = async (rid: number) => {
        if (!(await confirm({ title: 'Desvincular responsable', message: '¿Confirmar desvincular este responsable?', confirmText: 'Desvincular', variant: 'danger' }))) return;
        try { await api.delete(`/usuarios/${persona.id}/responsables/${rid}`); toast.success('Responsable desvinculado'); qc.invalidateQueries(); } catch (e) { toast.error(errMsg(e) || 'Error al desvincular'); }
    };

    const guardar = async () => {
        if (!editNombres.trim() || !editApellidos.trim()) { toast.error('Nombres y apellidos no pueden quedar vacíos'); return; }
        setGuardando(true);
        // Alumno: solo nombre. Administrativo: nombre + rol/cargo/departamento.
        const payload = esAlumno
            ? { nombres: editNombres.trim(), apellidos: editApellidos.trim(), carrera: editCarrera }
            : { nombres: editNombres.trim(), apellidos: editApellidos.trim(), cargo: editCargo, rol: editRol || undefined, departamentoId: editDepto === '' ? 0 : Number(editDepto) };
        try { await api.put(`/usuarios/${persona.id}`, payload); toast.success('Actualizado'); qc.invalidateQueries(); onClose(); }
        catch (e) { toast.error(errMsg(e) || 'Error'); }
        setGuardando(false);
    };
    const desactivar = async () => {
        if (!(await confirm({ title: 'Desactivar usuario', message: `¿Desactivar a ${persona.nombreCompleto}?\nYa no podrá acceder al sistema.`, confirmText: 'Desactivar', variant: 'danger' }))) return;
        try { await api.put(`/usuarios/${persona.id}`, { activo: false }); toast.success('Usuario desactivado'); qc.invalidateQueries(); onClose(); }
        catch { toast.error('Error'); }
    };
    const reactivar = async () => {
        if (!(await confirm({ title: 'Reactivar usuario', message: `¿Confirmar reactivar a ${persona.nombreCompleto}?`, confirmText: 'Reactivar', variant: 'primary' }))) return;
        try { await api.put(`/usuarios/${persona.id}`, { activo: true }); toast.success('Usuario reactivado'); qc.invalidateQueries(); onClose(); }
        catch { toast.error('Error'); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-utec-gray-100 bg-utec-gray-50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full ${ri.color} flex items-center justify-center text-lg font-bold`}>{persona.nombres[0]}{persona.apellidos[0]}</div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-utec-dark">{persona.nombreCompleto}</h3>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${persona.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{persona.activo ? 'Activo' : 'Inactivo'}</span>
                            </div>
                            <p className="text-xs text-utec-gray-200">{persona.correoUtec}</p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-utec-gray-100 flex items-center justify-center text-utec-gray-200 text-lg"><X size={16} /></button>
                    </div>
                </div>
                <div className="p-5 space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-utec-dark mb-2">Nombre</label>
                        <div className="grid grid-cols-2 gap-3">
                            <input type="text" value={editNombres} onChange={e => setEditNombres(e.target.value)} className="input-field" placeholder="Nombres" />
                            <input type="text" value={editApellidos} onChange={e => setEditApellidos(e.target.value)} className="input-field" placeholder="Apellidos" />
                        </div>
                    </div>
                    {esAlumno ? (
                        <>
                            <div>
                                <label className="block text-sm font-bold text-utec-dark mb-2"><GraduationCap size={13} className="inline align-[-2px]" /> Carrera</label>
                                <select value={editCarrera} onChange={e => setEditCarrera(e.target.value)} className="input-field">
                                    <option value="">— Sin carrera asignada —</option>
                                    {carreras?.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                                </select>
                            </div>
                            <p className="text-xs text-utec-gray-200 bg-utec-gray-50 border border-utec-gray-100 rounded-lg p-3">
                                <Backpack size={14} className="inline align-[-2px]" /> Es un <strong>alumno</strong> (Estudiante): solo puedes corregir su nombre y su carrera. Para darle un rol administrativo, créalo como administrativo.
                            </p>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-bold text-utec-dark mb-0.5">Rol</label>
                                <p className="text-[11px] text-utec-gray-200 mb-2">Define qué puede hacer esta persona en el sistema.</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {ROLES_ADMIN.map(r => (
                                        <button key={r.id} onClick={() => setEditRol(r.id)} className={`text-xs px-3 py-2.5 rounded-xl font-medium transition-all border ${editRol === r.id ? `${r.color} border-current shadow-sm` : 'bg-white border-gray-200 text-utec-gray-200 hover:border-gray-300'}`}><span className="inline-flex items-center gap-1.5"><r.Icon size={13} /> {r.label}</span></button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-utec-dark mb-0.5">Cargo</label>
                                <p className="text-[11px] text-utec-gray-200 mb-2">Título del puesto (opcional). Solo informativo.</p>
                                <input type="text" value={editCargo} onChange={e => setEditCargo(e.target.value)} placeholder="Ej: Director de Proyectos" className="input-field" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-utec-dark mb-0.5"><FolderOpen size={13} className="inline align-[-2px]" /> Departamento</label>
                                <p className="text-[11px] text-utec-gray-200 mb-2">Departamento académico al que pertenece.</p>
                                <select value={editDepto} onChange={e => setEditDepto(e.target.value === '' ? '' : Number(e.target.value))} className="input-field">
                                    <option value="">— Sin departamento —</option>
                                    {(departamentos ?? []).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                                </select>
                            </div>
                        </>
                    )}
                    {persona.laboratoriosAsignados && persona.laboratoriosAsignados.length > 0 && (
                        <div>
                            <label className="block text-sm font-bold text-utec-dark mb-2">Labs asignados</label>
                            <div className="flex flex-wrap gap-1">{persona.laboratoriosAsignados.map((l, i) => <span key={i} className="text-xs bg-utec-cyan/10 text-utec-cyan px-2 py-1 rounded-lg">{l}</span>)}</div>
                        </div>
                    )}
                    {esDirector && (
                        <div>
                            <label className="block text-sm font-bold text-utec-dark mb-0.5"><Wrench size={13} className="inline align-[-2px]" /> Responsables a cargo</label>
                            <p className="text-[11px] text-utec-gray-200 mb-2">Responsables de laboratorio que dependen de esta persona. Escribe un nombre y pulsa "+ Añadir" para vincularlo.</p>
                            {(aCargo ?? []).length > 0 ? (
                                <div className="flex flex-wrap gap-1 mb-2">
                                    {(aCargo ?? []).map(u => (
                                        <span key={u.id} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-lg flex items-center gap-1.5">
                                            {u.nombreCompleto}
                                            <button onClick={() => desvincularResp(u.id)} title="Quitar" className="text-red-400 hover:text-red-600 font-bold"><X size={16} /></button>
                                        </span>
                                    ))}
                                </div>
                            ) : <p className="text-xs text-utec-gray-200 italic mb-2">Sin responsables vinculados</p>}
                            <input type="text" value={buscarResp} onChange={e => setBuscarResp(e.target.value)} placeholder="Buscar responsable para añadir..." className="input-field text-sm mb-1" />
                            {buscarResp && (
                                <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg">
                                    {disponibles.slice(0, 20).map(u => (
                                        <button key={u.id} onClick={() => vincularResp(u.id)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-green-50 text-left">
                                            <span className="text-sm text-utec-dark truncate">{u.nombreCompleto}</span>
                                            <span className="text-xs text-green-600 font-medium flex-shrink-0">+ Añadir</span>
                                        </button>
                                    ))}
                                    {disponibles.length === 0 && <p className="text-xs text-utec-gray-200 text-center py-3">Sin resultados</p>}
                                </div>
                            )}
                            <p className="text-[11px] text-utec-cyan mt-1"><Lightbulb size={12} className="inline align-[-1px]" /> Al vincularlos, cuando asignes a ese responsable a un laboratorio, su director y departamento se completan solos.</p>
                        </div>
                    )}
                    {esAlumno && <SancionesPanel persona={persona} />}
                </div>
                <div className="flex items-center justify-between p-5 border-t border-utec-gray-100">
                    {persona.activo
                        ? <button onClick={desactivar} className="text-xs text-red-500 hover:text-red-700 font-medium hover:underline">Desactivar usuario</button>
                        : <button onClick={reactivar} className="text-xs text-green-600 hover:text-green-800 font-medium hover:underline">Reactivar usuario</button>}
                    <div className="flex gap-3">
                        <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
                        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm disabled:opacity-50">{guardando ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══ SancionesPanel (castigos que impiden RESERVAR, no el login) ═══ */
interface Sancion { id: number; usuarioId?: number; usuarioNombre?: string; laboratorioId: number | null; laboratorioCodigo: string | null; motivo: string; fechaInicio: string; fechaFin: string | null; activo: boolean; vigente: boolean; }

/* ═══ ModalSancionesActivas (vista global del gestor: todas las sanciones vigentes) ═══ */
export function ModalSancionesActivas({ onClose }: { onClose: () => void }) {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const { data: sanciones, isLoading } = useQuery({
        queryKey: ['sanciones-activas'],
        queryFn: () => api.get<{ data: Sancion[] }>('/sanciones/activas').then(r => r.data.data),
    });
    const levantar = async (s: Sancion) => {
        if (!(await confirm({ title: 'Levantar sanción', message: `¿Quitar la sanción de ${s.usuarioNombre ?? 'este alumno'}? Podrá volver a reservar.`, confirmText: 'Levantar', variant: 'primary' }))) return;
        try {
            await api.patch(`/sanciones/${s.id}/levantar`);
            toast.success('Sanción levantada');
            qc.invalidateQueries({ queryKey: ['sanciones-activas'] });
            qc.invalidateQueries({ queryKey: ['sanciones'] });
        } catch (e) { toast.error(errMsg(e) || 'Error'); }
    };
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-utec-gray-100 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-utec-dark flex items-center gap-2"><Ban size={18} className="text-red-500" /> Sanciones activas</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-utec-gray-100 flex items-center justify-center text-utec-gray-200"><X size={16} /></button>
                </div>
                <div className="p-5 overflow-y-auto">
                    {isLoading ? <p className="text-sm text-utec-gray-200">Cargando…</p>
                    : (sanciones ?? []).length === 0 ? <p className="text-sm text-utec-gray-200 italic">No hay sanciones activas.</p>
                    : (
                        <div className="space-y-2">
                            {sanciones!.map(s => (
                                <div key={s.id} className={`text-sm rounded-lg border p-3 flex items-start gap-2 ${s.vigente ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                                    <div className="flex-1">
                                        <div className="font-medium text-utec-dark">
                                            {s.usuarioNombre ?? `Alumno #${s.usuarioId}`}
                                            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${s.vigente ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>{s.vigente ? 'Vigente' : 'Programada / vencida'}</span>
                                        </div>
                                        <div className="text-utec-gray-200">{s.laboratorioCodigo ? `Lab ${s.laboratorioCodigo}` : 'Todos los laboratorios'} · {s.motivo}</div>
                                        <div className="text-utec-gray-200 text-xs">Desde {s.fechaInicio}{s.fechaFin ? ` hasta ${s.fechaFin}` : ' · indefinida'}</div>
                                    </div>
                                    <button onClick={() => levantar(s)} className="text-xs text-utec-cyan hover:underline font-medium flex-shrink-0">Levantar</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function SancionesPanel({ persona }: { persona: Usuario }) {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const hoy = new Date().toISOString().slice(0, 10);
    const [abrir, setAbrir] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [alcance, setAlcance] = useState<'todos' | 'labs'>('todos');
    const [labsSel, setLabsSel] = useState<number[]>([]);
    const [fechaInicio, setFechaInicio] = useState(hoy);
    const [fechaFin, setFechaFin] = useState('');
    const [guardando, setGuardando] = useState(false);

    const { data: sanciones } = useQuery({
        queryKey: ['sanciones', persona.id],
        queryFn: () => api.get<{ data: Sancion[] }>(`/sanciones/usuario/${persona.id}`).then(r => r.data.data),
    });
    const { data: labs } = useQuery({
        queryKey: ['labs-sancion'],
        queryFn: () => api.get<{ data: Lab[] }>('/laboratorios/mis-laboratorios').then(r => r.data.data),
        enabled: alcance === 'labs',
    });

    const toggleLab = (id: number) => setLabsSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

    const crear = async () => {
        if (!motivo.trim()) { toast.error('Indica el motivo de la sanción'); return; }
        if (alcance === 'labs' && labsSel.length === 0) { toast.error('Elige al menos un laboratorio'); return; }
        setGuardando(true);
        try {
            await api.post('/sanciones', {
                usuarioId: persona.id,
                laboratorioIds: alcance === 'todos' ? [] : labsSel,
                motivo: motivo.trim(),
                fechaInicio,
                fechaFin: fechaFin || null,
            });
            toast.success('Sanción aplicada');
            setMotivo(''); setLabsSel([]); setFechaFin(''); setAlcance('todos'); setAbrir(false);
            qc.invalidateQueries({ queryKey: ['sanciones', persona.id] });
        } catch (e) { toast.error(errMsg(e) || 'Error al sancionar'); }
        setGuardando(false);
    };

    const levantar = async (s: Sancion) => {
        if (!(await confirm({ title: 'Levantar sanción', message: '¿Quitar esta sanción? El alumno podrá volver a reservar.', confirmText: 'Levantar', variant: 'primary' }))) return;
        try { await api.patch(`/sanciones/${s.id}/levantar`); toast.success('Sanción levantada'); qc.invalidateQueries({ queryKey: ['sanciones', persona.id] }); }
        catch (e) { toast.error(errMsg(e) || 'Error'); }
    };

    const activas = (sanciones ?? []).filter(s => s.activo);
    const historicas = (sanciones ?? []).filter(s => !s.activo);

    return (
        <div className="border-t border-utec-gray-100 pt-4">
            <label className="block text-sm font-bold text-utec-dark mb-0.5"><Ban size={13} className="inline align-[-2px] text-red-500" /> Sanciones</label>
            <p className="text-[11px] text-utec-gray-200 mb-2">Un castigo impide al alumno <strong>reservar</strong> (sigue pudiendo consultar). Puede ser en todos los labs o en algunos, temporal o indefinido.</p>
            {activas.length > 0 ? (
                <div className="space-y-1.5 mb-2">
                    {activas.map(s => (
                        <div key={s.id} className={`text-xs rounded-lg border p-2 flex items-start gap-2 ${s.vigente ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                            <div className="flex-1">
                                <div className="font-medium text-utec-dark">
                                    {s.laboratorioCodigo ?? 'Todos los laboratorios'}
                                    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${s.vigente ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>{s.vigente ? 'Vigente' : 'Programada / vencida'}</span>
                                </div>
                                <div className="text-utec-gray-200">{s.motivo}</div>
                                <div className="text-utec-gray-200">Desde {s.fechaInicio}{s.fechaFin ? ` hasta ${s.fechaFin}` : ' · indefinida'}</div>
                            </div>
                            <button onClick={() => levantar(s)} className="text-[11px] text-utec-cyan hover:underline font-medium flex-shrink-0">Levantar</button>
                        </div>
                    ))}
                </div>
            ) : <p className="text-xs text-utec-gray-200 italic mb-2">Sin sanciones activas</p>}

            {!abrir ? (
                <button onClick={() => setAbrir(true)} className="text-xs text-red-500 hover:text-red-700 font-medium hover:underline"><Ban size={12} className="inline align-[-1px]" /> Sancionar</button>
            ) : (
                <div className="bg-utec-gray-50 border border-utec-gray-100 rounded-lg p-3 space-y-2">
                    <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (p. ej. incumplimiento del reglamento)" className="input-field text-sm" />
                    <div className="flex gap-2 text-xs">
                        <button onClick={() => setAlcance('todos')} className={`px-3 py-1.5 rounded-lg border font-medium ${alcance === 'todos' ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white border-gray-200 text-utec-gray-200'}`}>Todos los labs</button>
                        <button onClick={() => setAlcance('labs')} className={`px-3 py-1.5 rounded-lg border font-medium ${alcance === 'labs' ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white border-gray-200 text-utec-gray-200'}`}>Labs específicos</button>
                    </div>
                    {alcance === 'labs' && (
                        <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg bg-white">
                            {(labs ?? []).map(l => (
                                <button key={l.id} onClick={() => toggleLab(l.id)} className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-red-50 ${labsSel.includes(l.id) ? 'bg-red-50' : ''}`}>
                                    <span className="truncate">{l.codigoLab} · {l.nombre}</span>
                                    {labsSel.includes(l.id) && <Check size={13} className="text-red-500 flex-shrink-0" />}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-[11px] text-utec-gray-200 mb-0.5">Desde</label>
                            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="input-field text-sm" />
                        </div>
                        <div>
                            <label className="block text-[11px] text-utec-gray-200 mb-0.5">Hasta (vacío = indefinida)</label>
                            <input type="date" value={fechaFin} min={fechaInicio} onChange={e => setFechaFin(e.target.value)} className="input-field text-sm" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setAbrir(false); setMotivo(''); setLabsSel([]); setFechaFin(''); }} className="btn-secondary text-xs">Cancelar</button>
                        <button onClick={crear} disabled={guardando} className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50">{guardando ? 'Aplicando...' : 'Aplicar sanción'}</button>
                    </div>
                </div>
            )}

            {historicas.length > 0 && (
                <details className="mt-2">
                    <summary className="text-[11px] text-utec-gray-200 cursor-pointer">Historial ({historicas.length})</summary>
                    <div className="space-y-1 mt-1">
                        {historicas.map(s => (
                            <div key={s.id} className="text-[11px] text-utec-gray-200 border border-gray-100 rounded p-1.5">
                                {s.laboratorioCodigo ?? 'Todos'} · {s.motivo} · {s.fechaInicio}{s.fechaFin ? `–${s.fechaFin}` : ''} <span className="italic">(levantada)</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}
