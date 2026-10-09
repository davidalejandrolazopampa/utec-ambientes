import { useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, GraduationCap, MapPin, Clock, Armchair, Wrench, Monitor, Eraser, X } from 'lucide-react';
import api from '@/services/api';
import PageHeader, { btnOnBanner } from '@/components/ui/PageHeader';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';

// Sección con tarjeta + ícono (estilo unificado del formulario).
function Section({ icon, title, subtitle, cols = 2, action, children }: {
    icon: ReactNode; title: string; subtitle?: string; cols?: 1 | 2; action?: ReactNode; children: ReactNode;
}) {
    return (
        <section className="card">
            <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-100">
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-utec-cyan/10 text-utec-cyan shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                    <h2 className="font-display font-bold text-utec-dark leading-tight">{title}</h2>
                    {subtitle && <p className="text-xs text-utec-gray-200">{subtitle}</p>}
                </div>
                {action}
            </div>
            <div className={`grid grid-cols-1 ${cols === 2 ? 'md:grid-cols-2' : ''} gap-5`}>
                {children}
            </div>
        </section>
    );
}

const pisos = [
    { value: -2, label: 'Sótano 2' },
    { value: -1, label: 'Sótano 1' },
    ...Array.from({ length: 11 }, (_, i) => ({ value: i + 1, label: `Piso ${i + 1}` })),
];

const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface Facultad { id: number; nombre: string; }
interface Departamento { id: number; nombre: string; facultadId: number; directorId?: number; }
interface Carrera { id: number; nombre: string; facultadId: number; }
interface Usuario { id: number; nombreCompleto: string; rol: string; }

export default function CrearLaboratorioPage({ onClose }: { onClose?: () => void } = {}) {
    const navigate = useNavigate();
    const confirm = useConfirm();
    // Modo modal: si recibe onClose, al crear/cancelar cierra la ventana (en vez de navegar).
    const enModal = !!onClose;
    const cerrar = () => (onClose ? onClose() : navigate('/laboratorios'));

    const [facultadId, setFacultadId] = useState<string>('');

    const [form, setForm] = useState({
        codigoLab: '',
        nombre: '',
        departamentoId: '',
        carreraId: '',
        piso: 1,
        ubicacionFase: 'Fase 2',
        resena: '',
        horaApertura: '08:00',
        horaCierre: '18:00',
        // Recursos reservables: cuántas mesas y cuántos PCs (0 = ninguno). Un lab puede tener
        // ambos (ej. 10 mesas + 1 PC). Las estaciones/equipos van en "Equipos especializados".
        mesasCantidad: 1,
        mesasCapacidad: 4,
        pcsCantidad: 0,
        pcsCapacidad: 1,
        directorId: '',
        responsablesIds: [] as number[],
        diasAtencion: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
        equiposEspecializados: [] as { nombre: string; tipo: string; cantidad: number; capacidadPersonas: number }[],
    });

    // Queries
    const { data: facultades } = useQuery({
        queryKey: ['facultades'],
        queryFn: () => api.get('/estructura/facultades'),
        select: (res) => res.data.data as Facultad[],
    });

    const { data: departamentos } = useQuery({
        queryKey: ['departamentos', facultadId],
        queryFn: () => api.get(`/estructura/departamentos${facultadId ? `?facultadId=${facultadId}` : ''}`),
        select: (res) => res.data.data as Departamento[],
    });

    // Carreras: si hay departamento elegido, se filtran por departamento (cada depto tiene
    // sus carreras); si no, por facultad. (Las carreras sin departamento_id solo salen por facultad.)
    const { data: carreras } = useQuery({
        queryKey: ['carreras', facultadId, form.departamentoId],
        queryFn: () => api.get(form.departamentoId
            ? `/estructura/carreras?departamentoId=${form.departamentoId}`
            : `/estructura/carreras${facultadId ? `?facultadId=${facultadId}` : ''}`),
        select: (res) => res.data.data as Carrera[],
        enabled: !!facultadId || !!form.departamentoId,
    });

    // Listas filtradas por rol en el SERVIDOR (no se trae toda la tabla de usuarios).
    // Directores: si hay facultad elegida, solo los que dirigen un departamento de esa facultad.
    const { data: directores } = useQuery({
        queryKey: ['directores-select', facultadId],
        queryFn: () => api.get(facultadId ? `/usuarios/directores?facultadId=${facultadId}` : '/usuarios/directores'),
        select: (res) => res.data.data as Usuario[],
    });

    const { data: responsablesTodos } = useQuery({
        queryKey: ['responsables-select'],
        queryFn: () => api.get('/usuarios/responsables'),
        select: (res) => res.data.data as Usuario[],
    });

    const { data: responsablesFiltrados } = useQuery({
        queryKey: ['responsables-director', form.directorId],
        queryFn: () => api.get(`/usuarios/por-director/${form.directorId}`),
        select: (res) => res.data.data as Usuario[],
        enabled: !!form.directorId,
    });

    // Cascada director → departamento → facultad: autocompleta el departamento del director
    // (y su facultad, que carga las carreras). Si no dirige ninguno, no toca nada.
    const autocompletarDeptoPorDirector = async (directorId: string) => {
        if (!directorId) return;
        try {
            const res = await api.get(`/estructura/departamento-por-director/${directorId}`);
            const depto = res.data.data as (Departamento & { facultadId?: number }) | null;
            if (depto && depto.id) {
                if (depto.facultadId) setFacultadId(String(depto.facultadId));
                setForm((prev) => ({ ...prev, departamentoId: String(depto.id), carreraId: '' }));
            }
        } catch { /* sin departamento asociado → se deja la selección manual */ }
    };

    // Al elegir director directamente: resetea los responsables (cambian según el director).
    const onDirectorChange = async (id: string) => {
        setForm((prev) => ({ ...prev, directorId: id, responsablesIds: [] }));
        await autocompletarDeptoPorDirector(id);
    };

    // Elegir departamento → ajusta su facultad (refiltra carreras) y su director (cambian
    // los responsables). Listas interligadas sin bucles (set directo de estado).
    const onDepartamentoChange = (depId: string) => {
        const depto = departamentos?.find((d) => String(d.id) === depId);
        setForm((prev) => ({
            ...prev,
            departamentoId: depId,
            carreraId: '',
            directorId: depto?.directorId ? String(depto.directorId) : prev.directorId,
            responsablesIds: depto?.directorId ? [] : prev.responsablesIds,
        }));
        if (depto?.facultadId) setFacultadId(String(depto.facultadId));
    };

    // Elegir carrera → ajusta su facultad (refiltra los departamentos).
    const onCarreraChange = (carId: string) => {
        const carrera = carreras?.find((c) => String(c.id) === carId);
        setForm((prev) => ({ ...prev, carreraId: carId }));
        if (carrera?.facultadId) setFacultadId(String(carrera.facultadId));
    };

    // Limpia toda la selección académica + responsables (evita arrastrar errores).
    const limpiarAcademico = () => {
        setFacultadId('');
        setForm((prev) => ({ ...prev, departamentoId: '', carreraId: '', directorId: '', responsablesIds: [] }));
    };


    const crearMutation = useMutation({
        mutationFn: (data: Record<string, unknown>) => api.post('/laboratorios', data),
        onSuccess: () => {
            toast.success('Laboratorio creado exitosamente');
            cerrar();
        },
        onError: (error: unknown) => {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Error al crear laboratorio');
        },
    });

    const handleSubmit = async () => {
        if (!form.codigoLab || !form.nombre) {
            toast.error('Código y nombre son obligatorios');
            return;
        }
        const ok = await confirm({
            title: 'Crear laboratorio',
            message: `¿Confirmar crear el laboratorio ${form.codigoLab} — ${form.nombre}?`,
            confirmText: 'Crear',
            variant: 'primary',
        });
        if (!ok) return;
        const { mesasCantidad, mesasCapacidad, pcsCantidad, pcsCapacidad, ...rest } = form;
        // Grupos de recursos reservables (solo los que tienen cantidad > 0).
        const recursos: { tipo: string; cantidad: number; capacidadPersonas: number }[] = [];
        if (mesasCantidad > 0) recursos.push({ tipo: 'MESA', cantidad: mesasCantidad, capacidadPersonas: mesasCapacidad });
        if (pcsCantidad > 0) recursos.push({ tipo: 'PC', cantidad: pcsCantidad, capacidadPersonas: pcsCapacidad });
        // "Aforo principal" del lab (para la tarjeta): el primer grupo, o mesas por defecto.
        const principal = recursos[0] ?? { tipo: 'MESA', cantidad: 0, capacidadPersonas: mesasCapacidad };
        crearMutation.mutate({
            ...rest,
            aforoTipo: principal.tipo,
            aforoCantidad: principal.cantidad,
            aforoCapacidad: principal.capacidadPersonas,
            recursos,
            horaApertura: rest.horaApertura + ':00',
            horaCierre: rest.horaCierre + ':00',
            departamentoId: rest.departamentoId ? Number(rest.departamentoId) : null,
            carreraId: rest.carreraId ? Number(rest.carreraId) : null,
            directorId: rest.directorId ? Number(rest.directorId) : null,
            responsablesIds: rest.responsablesIds,
            equiposEspecializados: rest.equiposEspecializados.filter((e) => e.nombre.trim() !== ''),
        });
    };

    const toggleDia = (dia: string) => {
        setForm((prev) => ({
            ...prev,
            diasAtencion: prev.diasAtencion.includes(dia)
                ? prev.diasAtencion.filter((d) => d !== dia)
                : [...prev.diasAtencion, dia],
        }));
    };

    const toggleResponsable = async (id: number) => {
        const yaEsta = form.responsablesIds.includes(id);
        setForm((prev) => ({
            ...prev,
            responsablesIds: yaEsta
                ? prev.responsablesIds.filter((r) => r !== id)
                : [...prev.responsablesIds, id],
        }));
        // Cascada inversa: al marcar un responsable sin director elegido, autocompleta su
        // director (y de ahí, departamento + facultad). No borra el responsable recién marcado.
        if (!yaEsta && !form.directorId) {
            try {
                const res = await api.get(`/usuarios/director-de/${id}`);
                const director = res.data.data as Usuario | null;
                if (director && director.id) {
                    setForm((prev) => ({ ...prev, directorId: String(director.id) }));
                    await autocompletarDeptoPorDirector(String(director.id));
                }
            } catch { /* sin director vinculado → queda manual */ }
        }
    };

    const agregarEquipo = () => {
        setForm((prev) => ({
            ...prev,
            equiposEspecializados: [
                ...prev.equiposEspecializados,
                { nombre: '', tipo: 'Maquinaria', cantidad: 1, capacidadPersonas: 1 },
            ],
        }));
    };

    const actualizarEquipo = (index: number, field: string, value: string | number) => {
        setForm((prev) => ({
            ...prev,
            equiposEspecializados: prev.equiposEspecializados.map((eq, i) =>
                i === index ? { ...eq, [field]: value } : eq
            ),
        }));
    };

    const eliminarEquipo = (index: number) => {
        setForm((prev) => ({
            ...prev,
            equiposEspecializados: prev.equiposEspecializados.filter((_, i) => i !== index),
        }));
    };

    const contenido = (
        <div className={enModal ? 'bg-utec-gray-50 rounded-2xl p-5' : ''}>
            <PageHeader
                title="Crear Laboratorio"
                subtitle="Completa los datos del laboratorio, sus recursos y responsables"
                actions={<button onClick={cerrar} className="btn-secondary text-sm">Cancelar</button>}
            />

            <div className={`space-y-6 ${enModal ? '' : 'max-w-4xl'}`}>

                <Section icon={<ClipboardList size={18} />} title="Información general">

                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Código del laboratorio *</label>
                        <input
                            type="text"
                            value={form.codigoLab}
                            onChange={(e) => setForm({ ...form, codigoLab: e.target.value.toUpperCase() })}
                            placeholder="Ej: L301"
                            className="input-field"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Nombre *</label>
                        <input
                            type="text"
                            value={form.nombre}
                            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                            placeholder="Ej: Laboratorio de Robótica"
                            className="input-field"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-utec-dark mb-1">Descripción</label>
                        <textarea
                            value={form.resena}
                            onChange={(e) => setForm({ ...form, resena: e.target.value })}
                            placeholder="Descripción breve del laboratorio"
                            className="input-field"
                            rows={3}
                        />
                    </div>

                </Section>

                <Section icon={<GraduationCap size={18} />} title="Académica y responsables"
                    subtitle="Las listas se ajustan entre sí al elegir (departamento ↔ facultad ↔ director)" cols={2}
                    action={<button type="button" onClick={limpiarAcademico} className="text-sm text-utec-gray-200 hover:text-red-500 font-medium" title="Limpiar selección académica y responsables"><Eraser size={13} className="inline align-[-2px] mr-1" />Limpiar</button>}>

                    {/* ── Columna izquierda: estructura académica ── */}
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-utec-dark mb-1">Facultad</label>
                            <select
                                value={facultadId}
                                onChange={(e) => {
                                    // Cambiar la facultad manualmente reinicia depto/carrera y también
                                    // director/responsables (los directores se filtran por facultad).
                                    setFacultadId(e.target.value);
                                    setForm({ ...form, departamentoId: '', carreraId: '', directorId: '', responsablesIds: [] });
                                }}
                                className="input-field"
                            >
                                <option value="">Seleccionar facultad</option>
                                {facultades?.map((f) => (
                                    <option key={f.id} value={f.id}>{f.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-utec-dark mb-1">Departamento</label>
                            <select
                                value={form.departamentoId}
                                onChange={(e) => onDepartamentoChange(e.target.value)}
                                className="input-field"
                                disabled={!departamentos?.length}
                            >
                                <option value="">Sin departamento</option>
                                {departamentos?.map((d) => (
                                    <option key={d.id} value={d.id}>{d.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-utec-dark mb-1">Carrera</label>
                            <select
                                value={form.carreraId}
                                onChange={(e) => onCarreraChange(e.target.value)}
                                className="input-field"
                                disabled={!carreras?.length}
                            >
                                <option value="">Sin carrera específica</option>
                                {carreras?.map((c) => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* ── Columna derecha: director + responsables ── */}
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-utec-dark mb-1">Director</label>
                            <select
                                value={form.directorId}
                                onChange={(e) => onDirectorChange(e.target.value)}
                                className="input-field"
                            >
                                <option value="">Sin director asignado</option>
                                {directores?.map((u) => (
                                    <option key={u.id} value={u.id}>{u.nombreCompleto}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-utec-dark mb-2">Responsables de laboratorio</label>
                            <div className="space-y-2 max-h-44 overflow-y-auto border border-utec-gray-100 rounded-lg p-2">
                                {((form.directorId ? responsablesFiltrados : responsablesTodos) ?? []).length === 0 ? (
                                    <p className="text-xs text-utec-gray-200 text-center py-2">No hay responsables disponibles.</p>
                                ) : (form.directorId ? responsablesFiltrados : responsablesTodos)?.map((u) => (
                                    <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={form.responsablesIds.includes(u.id)}
                                            onChange={() => toggleResponsable(u.id)}
                                            className="rounded border-utec-gray-100 text-utec-cyan focus:ring-utec-cyan"
                                        />
                                        <span className="text-sm text-utec-dark">{u.nombreCompleto}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                </Section>

                <Section icon={<MapPin size={18} />} title="Ubicación física">

                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Piso *</label>
                        <select
                            value={form.piso}
                            onChange={(e) => setForm({ ...form, piso: Number(e.target.value) })}
                            className="input-field"
                        >
                            {pisos.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Fase *</label>
                        <select
                            value={form.ubicacionFase}
                            onChange={(e) => setForm({ ...form, ubicacionFase: e.target.value })}
                            className="input-field"
                        >
                            <option value="Fase 1">Fase 1</option>
                            <option value="Fase 2">Fase 2</option>
                        </select>
                    </div>

                </Section>

                <Section icon={<Clock size={18} />} title="Configuración operativa">

                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Hora apertura *</label>
                        <input
                            type="time"
                            value={form.horaApertura}
                            onChange={(e) => setForm({ ...form, horaApertura: e.target.value })}
                            className="input-field"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Hora cierre *</label>
                        <input
                            type="time"
                            value={form.horaCierre}
                            onChange={(e) => setForm({ ...form, horaCierre: e.target.value })}
                            className="input-field"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-utec-dark mb-2">Días de atención *</label>
                        <div className="flex flex-wrap gap-2">
                            {diasSemana.map((dia) => (
                                <button
                                    key={dia}
                                    type="button"
                                    onClick={() => toggleDia(dia)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        form.diasAtencion.includes(dia)
                                            ? 'bg-utec-cyan text-utec-dark'
                                            : 'bg-utec-gray-50 text-utec-gray-200 border border-utec-gray-100'
                                    }`}
                                >
                                    {dia}
                                </button>
                            ))}
                        </div>
                    </div>

                </Section>

                <Section icon={<Armchair size={18} />} title="Recursos reservables"
                    subtitle="Cuántas mesas y/o PCs hay (0 si no aplica). Las estaciones/equipos van en la sección de abajo.">

                    {/* Mesas */}
                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1"><Armchair size={13} className="inline align-[-2px] mr-1" />Mesas — cantidad</label>
                        <input
                            type="number"
                            value={form.mesasCantidad}
                            onChange={(e) => setForm({ ...form, mesasCantidad: Math.max(0, Number(e.target.value)) })}
                            min={0}
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Sillas por mesa</label>
                        <input
                            type="number"
                            value={form.mesasCapacidad}
                            onChange={(e) => setForm({ ...form, mesasCapacidad: Math.min(10, Math.max(1, Number(e.target.value))) })}
                            min={1} max={10}
                            className="input-field"
                        />
                    </div>

                    {/* PCs */}
                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1"><Monitor size={13} className="inline align-[-2px] mr-1" />PCs — cantidad</label>
                        <input
                            type="number"
                            value={form.pcsCantidad}
                            onChange={(e) => setForm({ ...form, pcsCantidad: Math.max(0, Number(e.target.value)) })}
                            min={0}
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-utec-dark mb-1">Personas por PC</label>
                        <input
                            type="number"
                            value={form.pcsCapacidad}
                            onChange={(e) => setForm({ ...form, pcsCapacidad: Math.min(10, Math.max(1, Number(e.target.value))) })}
                            min={1} max={10}
                            className="input-field"
                        />
                    </div>

                </Section>

                <Section icon={<Wrench size={18} />} title="Equipos especializados (reservables)" cols={1}
                    action={<button type="button" onClick={agregarEquipo} className={btnOnBanner}>+ Agregar equipo</button>}>

                        {form.equiposEspecializados.length === 0 ? (
                            <p className="text-sm text-utec-gray-200 text-center py-4">
                                Sin equipos especializados. Click en "+ Agregar equipo" para añadir tornos, fresadoras, impresoras 3D, etc.
                            </p>
                        ) : (
                            <div className="space-y-4">
                                {form.equiposEspecializados.map((equipo, index) => (
                                    <div key={index} className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end bg-utec-gray-50 rounded-lg p-4">
                                        <div className="col-span-2 md:col-span-4">
                                            <label className="block text-xs font-medium text-utec-dark mb-1">Nombre *</label>
                                            <input
                                                type="text"
                                                value={equipo.nombre}
                                                onChange={(e) => actualizarEquipo(index, 'nombre', e.target.value)}
                                                placeholder="Ej: Torno CNC"
                                                className="input-field text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="block text-xs font-medium text-utec-dark mb-1">Tipo</label>
                                            <select
                                                value={equipo.tipo}
                                                onChange={(e) => actualizarEquipo(index, 'tipo', e.target.value)}
                                                className="input-field text-sm"
                                            >
                                                <option value="Estación">Estación</option>
                                                <option value="Maquinaria">Maquinaria</option>
                                                <option value="Impresora 3D">Impresora 3D</option>
                                                <option value="Infraestructura">Infraestructura</option>
                                                <option value="Instrumento">Instrumento</option>
                                                <option value="Equipo de laboratorio">Equipo de laboratorio</option>
                                            </select>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-medium text-utec-dark mb-1">Cantidad</label>
                                            <input
                                                type="number"
                                                value={equipo.cantidad}
                                                onChange={(e) => actualizarEquipo(index, 'cantidad', Number(e.target.value))}
                                                min={1}
                                                className="input-field text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-medium text-utec-dark mb-1">Personas</label>
                                            <input
                                                type="number"
                                                value={equipo.capacidadPersonas}
                                                onChange={(e) => actualizarEquipo(index, 'capacidadPersonas', Number(e.target.value))}
                                                min={1}
                                                className="input-field text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-1 flex items-end">
                                            <button
                                                type="button"
                                                onClick={() => eliminarEquipo(index)}
                                                className="text-red-500 hover:text-red-700 text-sm font-medium pb-2"
                                                title="Eliminar equipo"
                                                aria-label="Eliminar equipo"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                    {/* ═══ RESUMEN ═══ */}
                    <div className="md:col-span-2 bg-utec-cyan-50 rounded-xl p-4">
                        <p className="text-sm text-utec-dark">
                            <strong>Resumen:</strong>{' '}
                            {[
                                form.mesasCantidad > 0 ? `${form.mesasCantidad} mesas (×${form.mesasCapacidad})` : null,
                                form.pcsCantidad > 0 ? `${form.pcsCantidad} PCs (×${form.pcsCapacidad})` : null,
                            ].filter(Boolean).join(' + ') || 'sin mesas ni PCs'}
                            {' '}— Capacidad: {form.mesasCantidad * form.mesasCapacidad + form.pcsCantidad * form.pcsCapacidad} personas
                            {form.equiposEspecializados.length > 0 && (
                                <> + {form.equiposEspecializados.reduce((sum, eq) => sum + eq.cantidad, 0)} equipos especializados reservables</>
                            )}
                        </p>
                        <p className="text-xs text-utec-gray-200 mt-1">
                            Cada recurso generará un QR único para check-in
                        </p>
                    </div>

                </Section>

                {/* ═══ BOTONES ═══ */}
                <div className="flex justify-end gap-4 sticky bottom-0 bg-white/85 backdrop-blur rounded-xl p-4 shadow-md border border-gray-100">
                    <button type="button" onClick={cerrar} className="btn-secondary">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={crearMutation.isPending || crearMutation.isSuccess || !form.codigoLab || !form.nombre}
                        className="btn-primary disabled:opacity-50"
                    >
                        {crearMutation.isPending ? 'Creando...' : 'Crear Laboratorio'}
                    </button>
                </div>
            </div>
        </div>
    );

    // En modo modal, el formulario va dentro de una ventana flotante con scroll.
    if (enModal) {
        return (
            <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto p-4">
                <div className="max-w-4xl mx-auto my-4" onClick={e => e.stopPropagation()}>{contenido}</div>
            </div>
        );
    }
    return contenido;
}