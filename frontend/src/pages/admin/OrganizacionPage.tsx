import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, FlaskConical, Users, Briefcase, GraduationCap, FolderOpen, AlertTriangle, Check, X, Pencil, Trash2, Lightbulb, BookOpen, Search, ChevronRight, Landmark, Wrench, Ban } from 'lucide-react';
import api from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useDebounce } from '@/hooks/useDebounce';
import { ROLES, ROLES_ADMIN, rolInfo, errMsg } from './organizacion/types';
import type { Usuario, UsuarioPage, Lab, Facultad, Departamento, Carrera, Tab } from './organizacion/types';
import { FacultadCard, DepCard } from './organizacion/cards';
import { ModalCrearPersona, ModalCrearEstructura, ModalAsignarPersona, ModalLab, ModalPersona, ModalSancionesActivas } from './organizacion/modals';
import CrearLaboratorioPage from './CrearLaboratorioPage';

export default function OrganizacionPage() {
    const qc = useQueryClient();
    const confirm = useConfirm();
    // Solo el ADMIN gestiona la organización completa; COORDINADOR y DOCENCIA entran en modo
    // DIRECTORIO (solo la pestaña Personas, lectura): el backend ya les acota la lista
    // (coordinador → directores/responsables; docencia → docencia).
    const esAdminRol = useAuthStore((s) => s.user?.rol === 'ADMIN');
    const [tab, setTab] = useState<Tab>(esAdminRol ? 'estructura' : 'personas');
    const [buscar, setBuscar] = useState('');
    const q = useDebounce(buscar, 300).toLowerCase();
    const [expandedFacultades, setExpandedFacultades] = useState<Record<number, boolean>>({});
    const [modalLab, setModalLab] = useState<Lab | null>(null);
    const [modalPersona, setModalPersona] = useState<Usuario | null>(null);
    const [crearTipo, setCrearTipo] = useState<'facultad' | 'departamento' | 'carrera' | null>(null);
    const [crearPersona, setCrearPersona] = useState(false);
    const [sancionesOpen, setSancionesOpen] = useState(false);
    const [crearLab, setCrearLab] = useState(false);
    const [filtroActivo, setFiltroActivo] = useState<'activos' | 'inactivos' | 'todos'>('activos');
    const [personasTipo, setPersonasTipo] = useState<'administrativos' | 'alumnos'>('administrativos');
    const [editarEstructura, setEditarEstructura] = useState<{ tipo: 'facultad' | 'departamento' | 'carrera'; id: number; nombre: string; facultadId?: number; departamentoId?: number; facTipo?: string } | null>(null);
    const [asignar, setAsignar] = useState<{ tipo: 'decano' | 'director'; targetId: number; targetNombre: string; actualId?: number; esDireccion?: boolean } | null>(null);

    // Administrativos (lista pequeña, no trae alumnos): resuelve decano/director/responsable y
    // el toggle "Administrativos". Los alumnos NO se cargan todos → van paginados por servidor.
    const { data: admins } = useQuery({ queryKey: ['usuarios-administrativos'], queryFn: () => api.get<{ data: Usuario[] }>('/usuarios/administrativos'), select: r => r.data.data });
    const usuarios = admins;   // compat: los índices/derivados de admins usan este alias
    const { data: conteoRoles } = useQuery({ queryKey: ['usuarios-conteo'], queryFn: () => api.get<{ data: Record<string, number> }>('/usuarios/conteo-roles'), select: r => r.data.data, enabled: esAdminRol });
    // Alumnos PAGINADOS por servidor (búsqueda + estado como parámetros). Solo se pide en la
    // pestaña Personas → Alumnos. `page` se reinicia al cambiar búsqueda/filtro/tipo.
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;
    useEffect(() => { setPage(0); }, [q, filtroActivo, personasTipo]);
    const alumnosUrl = useMemo(() => {
        const p = new URLSearchParams({ rol: 'ESTUDIANTE', page: String(page), size: String(PAGE_SIZE) });
        if (q) p.set('q', q);
        if (filtroActivo !== 'todos') p.set('activo', String(filtroActivo === 'activos'));
        return `/usuarios/buscar?${p.toString()}`;
    }, [q, filtroActivo, page]);
    const { data: alumnosPage, isFetching: alumnosLoading } = useQuery({
        queryKey: ['usuarios-buscar', 'ESTUDIANTE', q, filtroActivo, page],
        queryFn: () => api.get<{ data: UsuarioPage }>(alumnosUrl),
        select: r => r.data.data,
        enabled: esAdminRol && tab === 'personas' && personasTipo === 'alumnos',
        placeholderData: (prev) => prev,
    });
    // Estructura/labs: endpoints ADMIN-only (OrganizacionController, /laboratorios/admin/todos) —
    // en el modo directorio (no-admin) no se piden (darían 403).
    const { data: labs } = useQuery({ queryKey: ['laboratorios-all'], queryFn: () => api.get<{ data: Lab[] }>('/laboratorios/admin/todos'), select: r => r.data.data, enabled: esAdminRol });
    const { data: facultades } = useQuery({ queryKey: ['facultades'], queryFn: () => api.get<{ data: Facultad[] }>('/organizacion/facultades'), select: r => r.data.data, enabled: esAdminRol });
    const { data: departamentos } = useQuery({ queryKey: ['departamentos'], queryFn: () => api.get<{ data: Departamento[] }>('/organizacion/departamentos'), select: r => r.data.data, enabled: esAdminRol });
    const { data: carreras } = useQuery({ queryKey: ['carreras-org'], queryFn: () => api.get<{ data: Carrera[] }>('/organizacion/carreras'), select: r => r.data.data, enabled: esAdminRol });

    // Índices O(1) en memoria — evitan filtros anidados en el render. Cada nivel va ORDENADO
    // (labs por código numérico, departamentos por nombre) para que la estructura tenga un
    // orden estable y predecible, no el orden de llegada de la API.
    const usuariosMap = useMemo(() => new Map((usuarios ?? []).map(u => [u.id, u])), [usuarios]);
    const usuariosPorNombre = useMemo(() => new Map((usuarios ?? []).map(u => [u.nombreCompleto, u])), [usuarios]);
    const labsPorDepto = useMemo(() => {
        const m = new Map<number, Lab[]>();
        (labs ?? []).forEach(l => { if (l.departamentoId != null) (m.get(l.departamentoId) ?? m.set(l.departamentoId, []).get(l.departamentoId)!).push(l); });
        m.forEach(list => list.sort((a, b) => a.codigoLab.localeCompare(b.codigoLab, undefined, { numeric: true })));
        return m;
    }, [labs]);
    const depsPorFacultad = useMemo(() => {
        const m = new Map<number, Departamento[]>();
        (departamentos ?? []).forEach(d => { if (d.facultadId != null) (m.get(d.facultadId) ?? m.set(d.facultadId, []).get(d.facultadId)!).push(d); });
        m.forEach(list => list.sort((a, b) => a.nombre.localeCompare(b.nombre)));
        return m;
    }, [departamentos]);

    // Puesto derivado (Decano de X / Director de Y) y candidatos a líderes
    const puestosPorUsuario = useMemo(() => {
        const m = new Map<number, string>();
        (facultades ?? []).forEach(f => { if (f.decanoId != null) m.set(f.decanoId, `${f.tipo === 'DIRECCION' ? 'Director/a' : 'Decano/a'} · ${f.nombre}`); });
        (departamentos ?? []).forEach(d => { if (d.directorId != null && !m.has(d.directorId)) m.set(d.directorId, `Director/a · ${d.nombre}`); });
        return m;
    }, [facultades, departamentos]);
    const lideres = useMemo(() => (usuarios ?? []).filter(u => ['DIRECTOR', 'ADMIN', 'COORDINADOR'].includes(u.rol)), [usuarios]);

    // Conteo por rol desde el endpoint (no desde la lista, que ya no trae alumnos).
    const countByRol = (rol: string) => conteoRoles?.[rol] ?? 0;

    const labsFiltrados = useMemo(() => (labs ?? [])
        .filter(l => !q || l.codigoLab.toLowerCase().includes(q) || l.nombre.toLowerCase().includes(q) || (l.directorNombre ?? '').toLowerCase().includes(q) || (l.responsables ?? []).some(r => r.toLowerCase().includes(q)))
        .sort((a, b) => {
            const ea = a.estado === 'ACTIVO' ? 0 : 1, eb = b.estado === 'ACTIVO' ? 0 : 1;
            return ea !== eb ? ea - eb : a.codigoLab.localeCompare(b.codigoLab);
        }), [labs, q]);

    // ADMINISTRATIVOS: lista pequeña ya cargada → se filtra en cliente (búsqueda + estado).
    // El orden/agrupado se DERIVA de ROLES_ADMIN (no hardcodear: al agregar un rol —p. ej.
    // DOCENCIA— desaparecía del listado porque su grupo no existía).
    const order = ROLES_ADMIN.map(r => r.id);
    const administrativos = useMemo(() => (admins ?? [])
        .filter(u => filtroActivo === 'todos' || (filtroActivo === 'activos' ? u.activo : !u.activo))
        .filter(u => !q || u.nombreCompleto.toLowerCase().includes(q) || u.correoUtec.toLowerCase().includes(q) || u.rol.toLowerCase().includes(q))
        .sort((a, b) => order.indexOf(a.rol) - order.indexOf(b.rol)), [admins, q, filtroActivo]);
    // ALUMNOS: vienen PAGINADOS del servidor (ya filtrados por búsqueda/estado).
    const estudiantes = alumnosPage?.content ?? [];
    const totalAlumnos = conteoRoles?.['ESTUDIANTE'] ?? 0;              // total real (chip del toggle)
    const alumnosFiltradosTotal = alumnosPage?.total ?? 0;             // total que cumple el filtro actual
    const totalPaginasAlumnos = alumnosPage?.totalPages ?? 0;

    const cambiarEstadoLab = async (e: React.MouseEvent, lab: Lab) => {
        e.stopPropagation();
        const nuevo = lab.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
        const ok = await confirm({
            title: nuevo === 'ACTIVO' ? 'Activar laboratorio' : 'Desactivar laboratorio',
            message: `¿Confirmar ${nuevo === 'ACTIVO' ? 'activar' : 'desactivar'} ${lab.codigoLab}?`,
            confirmText: nuevo === 'ACTIVO' ? 'Activar' : 'Desactivar',
            variant: nuevo === 'ACTIVO' ? 'primary' : 'danger',
        });
        if (!ok) return;
        try { await api.put(`/laboratorios/${lab.id}/estado?estado=${nuevo}`); toast.success(`${lab.codigoLab} ${nuevo.toLowerCase()}`); qc.invalidateQueries(); } catch { toast.error('Error'); }
    };
    const refrescar = () => qc.invalidateQueries();
    const toggleFacultad = (id: number) => setExpandedFacultades(p => ({ ...p, [id]: !p[id] }));

    const eliminarFacultad = async (f: Facultad) => {
        const n = (depsPorFacultad.get(f.id) ?? []).length;
        const ok = await confirm({
            title: 'Eliminar facultad',
            message: `¿Eliminar la facultad "${f.nombre}"?${n > 0 ? `\n\nTiene ${n} departamento(s) asociado(s); reasígnalos primero o el borrado fallará.` : ''}`,
            confirmText: 'Eliminar',
            variant: 'danger',
        });
        if (!ok) return;
        try { await api.delete(`/organizacion/facultades/${f.id}`); toast.success('Facultad eliminada'); qc.invalidateQueries(); }
        catch (e) { toast.error(errMsg(e) || 'No se pudo eliminar (¿tiene departamentos asociados?)'); }
    };
    const eliminarDepartamento = async (d: Departamento) => {
        const n = (labsPorDepto.get(d.id) ?? []).length;
        const ok = await confirm({
            title: 'Eliminar departamento',
            message: `¿Eliminar el departamento "${d.nombre}"?${n > 0 ? `\n\nTiene ${n} laboratorio(s) asociado(s).` : ''}`,
            confirmText: 'Eliminar',
            variant: 'danger',
        });
        if (!ok) return;
        try { await api.delete(`/organizacion/departamentos/${d.id}`); toast.success('Departamento eliminado'); qc.invalidateQueries(); }
        catch (e) { toast.error(errMsg(e) || 'No se pudo eliminar (¿tiene labs asociados?)'); }
    };
    const eliminarCarrera = async (c: Carrera) => {
        const ok = await confirm({ title: 'Eliminar carrera', message: `¿Eliminar la carrera "${c.nombre}"?`, confirmText: 'Eliminar', variant: 'danger' });
        if (!ok) return;
        try { await api.delete(`/organizacion/carreras/${c.id}`); toast.success('Carrera eliminada'); qc.invalidateQueries(); }
        catch (e) { toast.error(errMsg(e) || 'No se pudo eliminar'); }
    };

    // Filtro de la pestaña Estructura: una facultad/depto coincide si su nombre, o el de
    // alguno de sus departamentos/labs, contiene la búsqueda. Al buscar, se auto-expanden.
    const labMatch = (l: Lab) => l.codigoLab.toLowerCase().includes(q) || l.nombre.toLowerCase().includes(q);
    const depMatch = (d: Departamento) => d.nombre.toLowerCase().includes(q) || (labsPorDepto.get(d.id) ?? []).some(labMatch);
    const facultadMatch = (f: Facultad) => !q || f.nombre.toLowerCase().includes(q) || (depsPorFacultad.get(f.id) ?? []).some(depMatch);
    const facultadesEstructura = (facultades ?? []).filter(facultadMatch);
    // Agrupadas por TIPO para dar un orden claro a la pestaña: primero las FACULTADES
    // académicas (su líder es decano/a), luego las DIRECCIONES administrativas (Marketing,
    // DGA…, su líder es director/a de área); alfabéticas dentro de cada grupo.
    const facultadesAcademicas = facultadesEstructura.filter(f => f.tipo !== 'DIRECCION').sort((a, b) => a.nombre.localeCompare(b.nombre));
    const direcciones = facultadesEstructura.filter(f => f.tipo === 'DIRECCION').sort((a, b) => a.nombre.localeCompare(b.nombre));

    const depsHuerfanos = (departamentos ?? []).filter(d => d.facultadId == null && (!q || depMatch(d)));
    const labsHuerfanos = labsFiltrados.filter(l => l.departamentoId == null);
    const carrerasFiltradas = (carreras ?? []).filter(c => !q || c.nombre.toLowerCase().includes(q));
    const facNombre = (id?: number) => (facultades ?? []).find(f => f.id === id)?.nombre;
    const depNombre = (id?: number) => (departamentos ?? []).find(d => d.id === id)?.nombre;

    // Fila de persona unificada (misma altura/estructura para todos) → lista estable.
    // Para los roles acotados (no-admin) es SOLO LECTURA: sin clic al modal de edición.
    const filaPersona = (u: Usuario) => {
        const ri = rolInfo(u.rol);
        const labs = u.laboratoriosAsignados ?? [];
        return (
            <div key={u.id} onClick={esAdminRol ? () => setModalPersona(u) : undefined}
                 className={`bg-white rounded-lg border border-utec-gray-100 p-3 transition-all flex items-center gap-3 ${esAdminRol ? 'cursor-pointer hover:shadow-sm hover:border-utec-cyan/30' : ''}`}>
                <div className={`w-9 h-9 rounded-full ${ri.color} flex items-center justify-center text-sm font-bold flex-shrink-0`}>{u.nombres[0]}{u.apellidos[0]}</div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-utec-dark truncate">{u.nombreCompleto}</p>
                    <p className="text-xs text-utec-gray-200 truncate">{u.correoUtec}{u.cargo ? ` · ${u.cargo}` : ''}</p>
                    {u.rol === 'ESTUDIANTE' && <p className="text-[10px] text-utec-cyan font-medium truncate"><GraduationCap size={10} className="inline align-[-1px]" /> {u.carrera || 'Sin carrera asignada'}</p>}
                    {puestosPorUsuario.get(u.id) && <p className="text-[10px] text-purple-600 font-medium truncate">{puestosPorUsuario.get(u.id)}</p>}
                    {u.rol !== 'ESTUDIANTE' && u.departamentoId && !puestosPorUsuario.get(u.id) && (
                        <p className="text-[10px] text-utec-gray-200 truncate"><FolderOpen size={10} className="inline align-[-1px]" /> {depNombre(u.departamentoId) ?? 'Departamento'}</p>
                    )}
                </div>
                {labs.length > 0 && (
                    <div className="hidden sm:flex flex-wrap gap-1 flex-shrink-0 max-w-[180px] justify-end">
                        {labs.slice(0, 4).map((l, i) => <span key={i} className="text-[9px] bg-utec-cyan/10 text-utec-cyan px-1.5 py-0.5 rounded">{l.split(' - ')[0]}</span>)}
                        {labs.length > 4 && <span className="text-[9px] text-utec-gray-200">+{labs.length - 4}</span>}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div>
            {/* Header limpio: título + subtítulo + banda de stats compacta (sin acciones —
                las acciones viven en la toolbar sticky, JUNTO a la pestaña a la que aplican). */}
            <div className="mb-4 pb-4 border-b border-utec-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="w-1.5 self-stretch min-h-[2rem] rounded-full bg-gradient-to-b from-utec-blue to-utec-cyan" aria-hidden="true" />
                    <div className="min-w-0">
                        <h1 className="text-2xl font-display font-bold text-utec-dark">Organización</h1>
                        <p className="text-sm text-utec-gray-200 mt-0.5">{esAdminRol
                            ? 'Jerarquía académica de UTEC: facultades → departamentos → laboratorios, y las personas que los gestionan'
                            : 'Directorio de personas de tu ámbito (solo lectura)'}</p>
                    </div>
                </div>
                {/* Stats compactos con icono: los dos grupos de personas + cada nivel de la jerarquía. */}
                {esAdminRol && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
                    {[
                        { n: usuarios?.length || 0, label: 'Administrativos', Icon: Briefcase },
                        { n: totalAlumnos, label: 'Alumnos', Icon: GraduationCap },
                        { n: facultades?.length || 0, label: 'Facultades', Icon: Building2 },
                        { n: departamentos?.length || 0, label: 'Departamentos', Icon: FolderOpen },
                        { n: labs?.length || 0, label: 'Laboratorios', Icon: FlaskConical },
                        { n: carreras?.length || 0, label: 'Carreras', Icon: BookOpen },
                    ].map(s => (
                        <div key={s.label} className="flex items-center gap-2.5 bg-white border border-utec-gray-100 rounded-lg px-3 py-2">
                            <s.Icon size={16} className="text-utec-cyan flex-shrink-0" />
                            <div className="min-w-0">
                                <p className="text-lg font-bold leading-none text-utec-dark tabular-nums">{s.n.toLocaleString('es-PE')}</p>
                                <p className="text-[10px] text-utec-gray-200 mt-0.5 uppercase tracking-wide truncate">{s.label}</p>
                            </div>
                        </div>
                    ))}
                </div>
                )}
            </div>

            {/* Toolbar sticky: pestañas + búsqueda + ACCIONES DE LA PESTAÑA (contextuales).
                Una sola barra de trabajo: eliges dónde estás, filtras y creas — sin buscar
                los botones en otra parte de la página. */}
            <div className="sticky top-0 z-20 bg-bg backdrop-blur-sm py-3 -mx-1 px-1 mb-4 border-b border-line">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
                    <div className="flex bg-utec-gray-50 rounded-xl p-1 border border-utec-gray-100">
                        {(esAdminRol ? (['estructura', 'labs', 'personas'] as const) : (['personas'] as const)).map(t => (
                            <button key={t} onClick={() => { setTab(t); setBuscar(''); }} aria-pressed={tab === t}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1.5 cursor-pointer ${tab === t ? 'bg-utec-cyan text-white shadow-sm' : 'text-utec-gray-200 hover:text-utec-dark'}`}>
                                {t === 'estructura' ? <Building2 size={15} /> : t === 'labs' ? <FlaskConical size={15} /> : <Users size={15} />}
                                {t === 'estructura' ? 'Estructura' : t === 'labs' ? 'Labs' : 'Personas'}
                            </button>
                        ))}
                    </div>
                    <div className="relative flex-1 w-full lg:max-w-sm">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-utec-gray-200 pointer-events-none" />
                        <input type="text" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder={tab === 'labs' ? 'Buscar lab...' : tab === 'personas' ? 'Buscar persona...' : 'Buscar facultad, depto o lab...'} className="input-field text-sm w-full !pl-9" />
                        {buscar && <button onClick={() => setBuscar('')} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 text-utec-gray-200 hover:text-utec-dark cursor-pointer"><X size={16} /></button>}
                    </div>
                    {/* Acciones contextuales de la pestaña activa (solo ADMIN) */}
                    {esAdminRol && (
                    <div className="flex gap-2 flex-wrap lg:ml-auto">
                        {tab === 'estructura' && (
                            <>
                                <button onClick={() => setCrearTipo('facultad')} className="btn-primary text-sm">+ Facultad</button>
                                <button onClick={() => setCrearTipo('departamento')} className="btn-secondary text-sm">+ Departamento</button>
                                <button onClick={() => setCrearTipo('carrera')} className="btn-secondary text-sm">+ Carrera</button>
                            </>
                        )}
                        {tab === 'labs' && (
                            <button onClick={() => setCrearLab(true)} className="btn-primary text-sm">+ Nuevo Lab</button>
                        )}
                        {tab === 'personas' && (
                            <>
                                <button onClick={() => setSancionesOpen(true)} className="btn-secondary text-sm inline-flex items-center gap-1.5"><Ban size={14} /> Sanciones activas</button>
                                <button onClick={() => setCrearPersona(true)} className="btn-primary text-sm">+ Persona</button>
                            </>
                        )}
                    </div>
                    )}
                </div>
            </div>

            {/* Ayuda contextual: qué es y qué se hace en la pestaña activa */}
            <div className="mb-4 flex items-start gap-2 text-xs text-utec-gray-200 bg-utec-cyan/[0.04] border border-utec-cyan/10 rounded-lg px-3 py-2">
                <Lightbulb size={14} className="text-utec-cyan flex-shrink-0 mt-0.5" />
                <p>
                    {tab === 'estructura' && <>La <b className="text-utec-dark">jerarquía académica</b>: cada <b className="text-utec-dark">facultad</b> agrupa <b className="text-utec-dark">departamentos</b> y cada departamento sus <b className="text-utec-dark">laboratorios</b>. Despliega un nivel con clic, asigna líderes con <b className="text-utec-dark">Asignar/Cambiar</b> y crea con los botones de la barra.</>}
                    {tab === 'labs' && <>Todos los <b className="text-utec-dark">laboratorios</b> en tarjetas. Haz clic en uno para <b className="text-utec-dark">asignar su director y responsables</b>; el botón de estado activa/desactiva el lab (el horario y los recursos se editan en el detalle del lab).</>}
                    {tab === 'personas' && <>Las <b className="text-utec-dark">personas</b> del sistema, en dos grupos: <b className="text-utec-dark">Administrativos</b> (personal con rol) y <b className="text-utec-dark">Alumnos</b>. Despliega un rol, haz clic en alguien para editarlo, o da de alta con <b className="text-utec-dark">+ Persona</b>.</>}
                </p>
            </div>

            {/* ═══ ESTRUCTURA (acordeón, en 2 grupos: facultades académicas → direcciones) ═══ */}
            {tab === 'estructura' && (() => {
                const renderFacultad = (f: Facultad) => (
                    <FacultadCard key={f.id} f={f} expanded={!!q || !!expandedFacultades[f.id]} onToggle={() => toggleFacultad(f.id)}
                                  deps={depsPorFacultad.get(f.id) ?? []} decano={f.decanoId ? usuariosMap.get(f.decanoId) : undefined}
                                  usuariosMap={usuariosMap} usuariosPorNombre={usuariosPorNombre} labsPorDepto={labsPorDepto}
                                  onClickLab={setModalLab} onClickPersona={setModalPersona}
                                  onAsignarDecano={() => setAsignar({ tipo: 'decano', targetId: f.id, targetNombre: f.nombre, actualId: f.decanoId, esDireccion: f.tipo === 'DIRECCION' })}
                                  onAsignarDirector={(d) => setAsignar({ tipo: 'director', targetId: d.id, targetNombre: d.nombre, actualId: d.directorId })}
                                  onEditar={() => setEditarEstructura({ tipo: 'facultad', id: f.id, nombre: f.nombre, facTipo: f.tipo })}
                                  onEliminar={() => eliminarFacultad(f)}
                                  onEditarDep={(d) => setEditarEstructura({ tipo: 'departamento', id: d.id, nombre: d.nombre, facultadId: d.facultadId })}
                                  onEliminarDep={(d) => eliminarDepartamento(d)} />
                );
                const SeccionTitulo = ({ Icon, titulo, sub }: { Icon: typeof Building2; titulo: string; sub: string }) => (
                    <div className="pt-2 flex items-start gap-2">
                        <Icon size={15} className="text-utec-cyan flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wide text-utec-dark">{titulo}</h3>
                            <p className="text-[11px] text-utec-gray-200">{sub}</p>
                        </div>
                    </div>
                );
                // Pill de nivel de la leyenda (mismos colores que las cards → se aprende el código).
                const NivelPill = ({ color, children }: { color: string; children: React.ReactNode }) => (
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${color}`}>{children}</span>
                );
                return (
                <div className="space-y-3">
                    {/* Leyenda educativa: cómo se lee la jerarquía (mismos colores que las cards). */}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-utec-gray-200 bg-white border border-utec-gray-100 rounded-lg px-3 py-2">
                        <span className="font-semibold text-utec-dark mr-1">Cómo se lee:</span>
                        <NivelPill color="text-utec-cyan bg-utec-cyan/10 border-utec-cyan/20">Facultad</NivelPill>
                        <ChevronRight size={12} className="text-utec-gray-200" />
                        <NivelPill color="text-amber-600 bg-amber-50 border-amber-200">Dpto</NivelPill>
                        <ChevronRight size={12} className="text-utec-gray-200" />
                        <NivelPill color="text-utec-dark bg-white border-utec-gray-100"><FlaskConical size={10} className="inline align-[-1px] mr-0.5" />Laboratorio</NivelPill>
                        <ChevronRight size={12} className="text-utec-gray-200" />
                        <NivelPill color="text-green-600 bg-green-50 border-green-200"><Wrench size={10} className="inline align-[-1px] mr-0.5" />Responsables</NivelPill>
                        <span className="ml-1">— clic en un nivel para desplegarlo; Asignar/Cambiar para el líder.</span>
                    </div>

                    {/* Facultades académicas (decano → departamentos → labs) */}
                    {facultadesAcademicas.length > 0 && (
                        <>
                            <SeccionTitulo Icon={Building2} titulo={`Facultades académicas (${facultadesAcademicas.length})`}
                                           sub="Su líder es un decano/a. Cada facultad agrupa departamentos, y cada departamento sus laboratorios." />
                            {facultadesAcademicas.map(renderFacultad)}
                        </>
                    )}

                    {/* Direcciones administrativas (unidades no-facultad + independientes) */}
                    {(direcciones.length > 0 || depsHuerfanos.length > 0) && (
                        <>
                            <SeccionTitulo Icon={Landmark} titulo={`Direcciones administrativas (${direcciones.length + depsHuerfanos.length})`}
                                           sub="Unidades que no son facultad (Marketing, DGA…). Su líder es un director/a de área, no un decano." />
                            {direcciones.map(renderFacultad)}
                            {depsHuerfanos.map(d => (
                                <div key={d.id} className="bg-white rounded-xl border border-orange-200 overflow-hidden">
                                    <div className="bg-orange-50 px-4 pt-3 pb-1 border-b border-orange-100"><p className="text-[10px] text-orange-600 font-bold uppercase">Dirección independiente (sin facultad)</p></div>
                                    <div className="p-3"><DepCard d={d} dir={d.directorId ? usuariosMap.get(d.directorId) : undefined} usuariosPorNombre={usuariosPorNombre} labs={labsPorDepto.get(d.id) ?? []} onClickLab={setModalLab} onClickPersona={setModalPersona} onAsignarDirector={() => setAsignar({ tipo: 'director', targetId: d.id, targetNombre: d.nombre, actualId: d.directorId })} onEditar={() => setEditarEstructura({ tipo: 'departamento', id: d.id, nombre: d.nombre, facultadId: d.facultadId })} onEliminar={() => eliminarDepartamento(d)} /></div>
                                </div>
                            ))}
                        </>
                    )}

                    {labsHuerfanos.length > 0 && (
                        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                            <div className="bg-red-50 p-4 border-b border-red-100">
                                <p className="text-[10px] text-red-600 font-bold uppercase"><AlertTriangle size={11} className="inline align-[-1px]" /> Labs sin departamento ({labsHuerfanos.length})</p>
                                <p className="text-xs text-red-400">Asigna un responsable para auto-vincular</p>
                            </div>
                            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {labsHuerfanos.map(l => (
                                    <button key={l.id} onClick={() => setModalLab(l)} className="text-left text-[11px] bg-red-50/50 border border-red-100 px-3 py-2 rounded-lg hover:border-utec-cyan hover:bg-white transition-all">
                                        <span className="font-bold text-red-500">{l.codigoLab}</span> <span className="text-utec-dark">{l.nombre}</span>
                                        {l.directorNombre && <span className="text-amber-600 block"><Briefcase size={11} className="inline align-[-1px]" /> {l.directorNombre}</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 🎓 Carreras (alta/edición/eliminación) */}
                    {carrerasFiltradas.length > 0 && (
                        <>
                        <SeccionTitulo Icon={BookOpen} titulo={`Carreras (${carrerasFiltradas.length})`}
                                       sub="Las carreras que eligen los alumnos al reservar; cada una pertenece a una facultad (y opcionalmente a un departamento)." />
                        <div className="bg-white rounded-xl border border-utec-gray-100 overflow-hidden">
                            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {carrerasFiltradas.map(c => (
                                    <div key={c.id} className="flex items-start justify-between gap-2 text-[11px] bg-utec-gray-50 border border-utec-gray-100 px-3 py-2 rounded-lg">
                                        <div className="min-w-0">
                                            <p className="font-medium text-utec-dark">{c.nombre}</p>
                                            <p className="text-utec-gray-200">{facNombre(c.facultadId) ?? 'Sin facultad'}{c.departamentoId ? ` · ${depNombre(c.departamentoId) ?? ''}` : ''}</p>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0">
                                            <button onClick={() => setEditarEstructura({ tipo: 'carrera', id: c.id, nombre: c.nombre, facultadId: c.facultadId, departamentoId: c.departamentoId })} title="Editar carrera" className="text-utec-gray-200 hover:text-utec-cyan"><Pencil size={12} /></button>
                                            <button onClick={() => eliminarCarrera(c)} title="Eliminar carrera" className="text-utec-gray-200 hover:text-red-500"><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        </>
                    )}

                    {q && facultadesEstructura.length === 0 && depsHuerfanos.length === 0 && labsHuerfanos.length === 0 && carrerasFiltradas.length === 0 && (
                        <div className="text-center py-12 text-utec-gray-200">No se encontró nada en la estructura</div>
                    )}
                </div>
                );
            })()}

            {/* ═══ LABS ═══ */}
            {tab === 'labs' && (
                <div>
                    {/* Resumen de la pestaña: cuántos labs, cuántos activos y cuántos con tarea pendiente. */}
                    <p className="text-xs text-utec-gray-200 mb-3">
                        <b className="text-utec-dark tabular-nums">{labsFiltrados.length}</b> laboratorio{labsFiltrados.length === 1 ? '' : 's'}
                        <span className="mx-1.5">·</span><b className="text-green-600 tabular-nums">{labsFiltrados.filter(l => l.estado === 'ACTIVO').length}</b> activos
                        <span className="mx-1.5">·</span><b className={`tabular-nums ${labsFiltrados.some(l => !(l.responsables?.length)) ? 'text-red-500' : 'text-utec-dark'}`}>{labsFiltrados.filter(l => !(l.responsables?.length)).length}</b> sin responsable asignado
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {labsFiltrados.map(l => (
                        <div key={l.id} onClick={() => setModalLab(l)}
                             className={`bg-white rounded-xl border cursor-pointer transition-all hover:shadow-md hover:border-utec-cyan/40 flex flex-col ${l.estado !== 'ACTIVO' ? 'opacity-60 border-red-200' : 'border-utec-gray-100'}`}>
                            <div className="flex items-start justify-between gap-2 p-4 pb-2.5">
                                <div className="min-w-0">
                                    <span className="text-sm font-bold text-utec-cyan">{l.codigoLab}</span>
                                    <h3 className={`text-sm font-medium mt-0.5 ${l.estado !== 'ACTIVO' ? 'line-through text-utec-gray-200' : 'text-utec-dark'}`}>{l.nombre}</h3>
                                    {l.departamentoNombre && <p className="text-[10px] text-utec-gray-200 mt-0.5 truncate"><FolderOpen size={11} className="inline align-[-1px] text-utec-cyan" /> {l.departamentoNombre}</p>}
                                </div>
                                <button onClick={e => cambiarEstadoLab(e, l)}
                                        title={l.estado === 'ACTIVO' ? 'Clic para desactivar' : 'Clic para activar'}
                                        className={`text-[10px] px-2 py-1 rounded-lg font-semibold flex-shrink-0 cursor-pointer transition-colors ${l.estado === 'ACTIVO' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                                    {l.estado === 'ACTIVO' ? <><Check size={10} className="inline align-[-1px]" /> Activo</> : <><X size={10} className="inline align-[-1px]" /> Inactivo</>}
                                </button>
                            </div>
                            <div className="px-4 space-y-1.5 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-utec-gray-200 font-semibold uppercase tracking-wide w-[4.5rem] flex-shrink-0"><Briefcase size={10} className="inline align-[-1px] text-amber-600" /> Director</span>
                                    <p className="text-xs text-utec-dark truncate">{l.directorNombre || <span className="text-utec-gray-200 italic">Sin asignar</span>}</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-[10px] text-utec-gray-200 font-semibold uppercase tracking-wide w-[4.5rem] flex-shrink-0 mt-0.5"><Wrench size={10} className="inline align-[-1px] text-green-600" /> Resp.</span>
                                    <div className="flex-1 min-w-0">
                                        {l.responsables && l.responsables.length > 0
                                            ? <div className="flex flex-wrap gap-1">{l.responsables.map((r, i) => <span key={i} className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">{r}</span>)}</div>
                                            : <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded font-medium">Sin asignar</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-3 px-4 py-2 border-t border-utec-gray-50 text-[10px] text-utec-gray-200">
                                <span>{l.piso !== undefined ? `Piso ${l.piso} · ${l.ubicacionFase}` : ''}</span>
                                <span className="inline-flex items-center gap-0.5 text-utec-cyan font-medium">Gestionar <ChevronRight size={11} /></span>
                            </div>
                        </div>
                    ))}
                    {labsFiltrados.length === 0 && <div className="col-span-full text-center py-12 text-utec-gray-200">No se encontraron laboratorios</div>}
                    </div>
                </div>
            )}

            {/* ═══ PERSONAS ═══ */}
            {tab === 'personas' && (
                <div className="space-y-1">
                    {/* Conteo por rol (vive AQUÍ y no en el header: solo es relevante en Personas). */}
                    {esAdminRol && (
                    <div className="flex gap-2 mb-3 flex-wrap items-center">
                        <span className="text-[11px] text-utec-gray-200 font-semibold uppercase tracking-wide mr-1">Roles</span>
                        {ROLES.map(r => <span key={r.id} className={`${r.color} px-3 py-1.5 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5`}><r.Icon size={12} /> {r.label}: {countByRol(r.id)}</span>)}
                    </div>
                    )}
                    {/* Toggle principal: Administrativos | Alumnos (se ve un grupo a la vez), con labels.
                        Los alumnos solo los gestiona el ADMIN (los roles acotados ven su directorio). */}
                    <div className="flex flex-wrap items-end gap-4 mb-2">
                        {esAdminRol && (
                        <div>
                            <label className="block text-[10px] font-semibold text-utec-gray-200 uppercase tracking-wide mb-1">Ver</label>
                            <div className="flex bg-utec-gray-50 rounded-lg p-1 border border-utec-gray-100 w-fit">
                                {([['administrativos', `Administrativos (${admins?.length ?? 0})`], ['alumnos', `Alumnos (${totalAlumnos})`]] as const).map(([v, l]) => (
                                    <button key={v} onClick={() => setPersonasTipo(v)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${personasTipo === v ? 'bg-utec-cyan text-white' : 'text-utec-gray-200 hover:text-utec-dark'}`}>
                                        {l}
                                    </button>
                                ))}
                            </div>
                        </div>
                        )}
                        <div>
                            <label className="block text-[10px] font-semibold text-utec-gray-200 uppercase tracking-wide mb-1">Estado</label>
                            <div className="flex bg-utec-gray-50 rounded-lg p-1 border border-utec-gray-100 w-fit">
                                {([['activos', 'Activos'], ['inactivos', 'Inactivos'], ['todos', 'Todos']] as const).map(([v, l]) => (
                                    <button key={v} onClick={() => setFiltroActivo(v)}
                                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filtroActivo === v ? 'bg-utec-cyan text-white' : 'text-utec-gray-200 hover:text-utec-dark'}`}>
                                        {l}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* Explica qué es cada grupo para no adivinar */}
                    <p className="text-[11px] text-utec-gray-200 mb-3">
                        {personasTipo === 'administrativos'
                            ? (esAdminRol
                                ? 'Personal de UTEC con rol en el sistema. Despliega un grupo y haz clic en alguien para editar su rol, puesto o departamento.'
                                : 'Directorio del personal de tu ámbito. Despliega un grupo para ver a las personas (solo lectura).')
                            : 'Estudiantes que reservan laboratorios. Haz clic en alguno para corregir su nombre o carrera.'}
                    </p>
                    {/* ADMINISTRATIVOS: agrupados por rol en secciones DESPLEGABLES (la lista completa
                        era muy larga; cada grupo se abre a demanda con su conteo a la vista) */}
                    {personasTipo === 'administrativos' && (
                        <div className="space-y-2">
                            {order.map(rol => {
                                const grupo = administrativos.filter(u => u.rol === rol);
                                if (grupo.length === 0) return null;
                                const ri = rolInfo(rol);
                                return (
                                    <details key={rol} className="group rounded-xl border border-utec-gray-100 bg-white overflow-hidden">
                                        <summary className="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-3 py-2.5 hover:bg-utec-cyan/[0.04] transition-colors">
                                            <ChevronRight size={14} className="text-utec-gray-200 transition-transform duration-200 group-open:rotate-90 flex-shrink-0" />
                                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${ri.color} inline-flex items-center gap-1`}><ri.Icon size={12} /> {ri.label}</span>
                                            <span className="text-[11px] text-utec-gray-200 font-medium tabular-nums">{grupo.length} persona{grupo.length === 1 ? '' : 's'}</span>
                                            <span className="flex-1 h-px bg-utec-gray-100" />
                                        </summary>
                                        <div className="space-y-1 px-3 pb-3 pt-1 bg-utec-gray-50/50 border-t border-utec-gray-50">{grupo.map(filaPersona)}</div>
                                    </details>
                                );
                            })}
                        </div>
                    )}
                    {/* ALUMNOS: lista simple (ya vienen paginados del servidor) */}
                    {personasTipo === 'alumnos' && <div className="space-y-1">{estudiantes.map(filaPersona)}</div>}
                    {(personasTipo === 'administrativos' ? administrativos : estudiantes).length === 0 && (
                        <div className="text-center py-12 text-utec-gray-200">{personasTipo === 'alumnos' && alumnosLoading ? 'Cargando…' : `No se encontraron ${personasTipo === 'administrativos' ? 'administrativos' : 'alumnos'}`}</div>
                    )}
                    {/* Paginación de ALUMNOS (server-side): evita traer los ~miles de golpe. */}
                    {personasTipo === 'alumnos' && alumnosFiltradosTotal > 0 && (
                        <div className="flex items-center justify-between gap-3 pt-3 mt-2 border-t border-utec-gray-100 text-sm">
                            <span className="text-utec-gray-200">
                                {(page * PAGE_SIZE) + 1}–{Math.min((page + 1) * PAGE_SIZE, alumnosFiltradosTotal)} de <b className="text-utec-dark">{alumnosFiltradosTotal.toLocaleString('es-PE')}</b> alumnos{q || filtroActivo !== 'activos' ? ' (filtrados)' : ''}
                            </span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || alumnosLoading}
                                        className="px-3 py-1 rounded-md border border-utec-gray-100 text-xs font-medium disabled:opacity-40 hover:bg-utec-gray-50">← Anterior</button>
                                <span className="text-xs text-utec-gray-200">Pág. {page + 1} / {Math.max(1, totalPaginasAlumnos)}</span>
                                <button onClick={() => setPage(p => (p + 1 < totalPaginasAlumnos ? p + 1 : p))} disabled={page + 1 >= totalPaginasAlumnos || alumnosLoading}
                                        className="px-3 py-1 rounded-md border border-utec-gray-100 text-xs font-medium disabled:opacity-40 hover:bg-utec-gray-50">Siguiente →</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {(crearTipo || editarEstructura) && <ModalCrearEstructura tipo={editarEstructura?.tipo ?? crearTipo!} facultades={facultades ?? []} departamentos={departamentos ?? []} editar={editarEstructura ?? undefined} onClose={() => { setCrearTipo(null); setEditarEstructura(null); }} />}
            {asignar && <ModalAsignarPersona info={asignar} candidatos={lideres} onClose={() => setAsignar(null)} />}
            {modalLab && <ModalLab lab={modalLab} usuarios={usuarios || []} onClose={() => { setModalLab(null); refrescar(); }} />}
            {modalPersona && <ModalPersona persona={modalPersona} onClose={() => { setModalPersona(null); refrescar(); }} />}
            {crearPersona && <ModalCrearPersona departamentos={departamentos ?? []} onClose={() => { setCrearPersona(false); refrescar(); }} />}
            {sancionesOpen && <ModalSancionesActivas onClose={() => setSancionesOpen(false)} />}
            {crearLab && <CrearLaboratorioPage onClose={() => { setCrearLab(false); refrescar(); }} />}
        </div>
    );
}

