import { useEffect, useMemo, useState } from 'react';
import {
  BookOutlined, CheckCircleFilled, ClockCircleOutlined, DiffOutlined, EditOutlined,
  FileTextOutlined, HomeOutlined, InboxOutlined, PictureOutlined, SafetyCertificateOutlined, SearchOutlined,
} from '@ant-design/icons';
import { App, Badge, Button, Checkbox, Drawer, Form, Input, Modal, Segmented, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { historyApi } from '../../api/history';
import logoUrl from '../../assets/pspa-logo.png';
import { PageHeader } from '../../components/PageHeader';
import { useAuthStore } from '../../store/authStore';
import type { HistoryContribution, HistoryEntry } from '../../types/history';
import { hasRole } from '../../utils/permissions';
import './history-wiki.css';

type Workspace = 'article' | 'contributions' | 'review';

const statusColor: Record<HistoryContribution['status'], string | undefined> = { draft: undefined, pending: 'processing', returned: 'warning', approved: 'success', rejected: 'error' };
const statusText: Record<HistoryContribution['status'], string> = { draft: '草稿', pending: '审核中', returned: '已退回', approved: '已通过', rejected: '已驳回' };

export function HistoryWikiPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const canReview = hasRole(user, 'admin');
  const [workspace, setWorkspace] = useState<Workspace>('article');
  const [keyword, setKeyword] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [contributions, setContributions] = useState<HistoryContribution[]>([]);
  const [reviews, setReviews] = useState<HistoryContribution[]>([]);
  const [activeEntry, setActiveEntry] = useState<HistoryEntry | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<HistoryContribution | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentDescription, setAttachmentDescription] = useState('');
  const [attachmentSourceNote, setAttachmentSourceNote] = useState('');
  const [attachmentRightsNote, setAttachmentRightsNote] = useState('');
  const [attachmentConsent, setAttachmentConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [entryItems, mine, pending] = await Promise.all([
        historyApi.listEntries(keyword.trim() || undefined),
        user?.role === 'alumni' ? historyApi.listMine() : Promise.resolve([]),
        canReview ? historyApi.listPending() : Promise.resolve([]),
      ]);
      setEntries(entryItems);
      setContributions(mine);
      setReviews(pending);
      setActiveEntry((current) => entryItems.find((item) => item.id === current?.id) ?? entryItems[0] ?? null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '院史数据加载失败');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
  // Access to private collections changes with the current role.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const entryCount = useMemo(() => entries.length, [entries]);

  const selectAttachments = (fileList: FileList | null) => {
    if (!fileList) return;
    const selected = Array.from(fileList);
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (selected.some((file) => !allowedTypes.includes(file.type))) {
      message.error('仅支持 JPG、PNG、WebP、PDF 格式');
      return;
    }
    if (selected.some((file) => file.size > 10 * 1024 * 1024)) {
      message.error('单个附件不能超过 10 MB');
      return;
    }
    if (attachments.length + selected.length > 6) {
      message.error('每次投稿最多上传 6 个附件');
      return;
    }
    setAttachments((current) => [...current, ...selected]);
  };

  const submitContribution = async () => {
    try {
      const values = await form.validateFields();
    if (attachments.length && (!attachmentSourceNote.trim() || !attachmentRightsNote.trim() || !attachmentConsent)) {
      message.warning('请填写附件来源、授权说明，并确认有权提交图片或扫描件');
      return;
    }
    const draft = await historyApi.createDraft({ entry_id: activeEntry?.id, title: values.title, section_name: values.section_name, content: values.content, source_note: values.source_note, change_note: values.change_note });
    for (const file of attachments) {
      await historyApi.uploadAttachment(draft.id, file, {
        description: attachmentDescription.trim() || file.name,
        source_note: attachmentSourceNote.trim(),
        rights_note: attachmentRightsNote.trim(),
        consent_confirmed: attachmentConsent,
      });
    }
    await historyApi.submit(draft.id);
    message.success('内容已提交审核，通过前不会影响正式词条。');
    form.resetFields();
    setAttachments([]);
    setAttachmentDescription('');
    setAttachmentSourceNote('');
    setAttachmentRightsNote('');
    setAttachmentConsent(false);
    setEditorOpen(false);
    setWorkspace('contributions');
      await load();
    } catch (error) {
      const validationFailed = typeof error === 'object' && error !== null && 'errorFields' in error;
      message.error(validationFailed ? '请先填写词条标题、正文和资料来源' : error instanceof Error ? error.message : '投稿提交失败，请稍后重试');
    }
  };

  const review = async (action: 'approve' | 'return' | 'reject') => {
    if (!selectedReview) return;
    if (action !== 'approve' && !reviewComment.trim()) { message.warning('退回或驳回时请填写审核意见。'); return; }
    await historyApi.review(selectedReview.id, { action, review_comment: reviewComment.trim() || '资料来源已核验。' });
    message.success(action === 'approve' ? '审核通过，已生成新的正式版本。' : action === 'return' ? '已退回投稿人补充。' : '投稿已驳回。');
    setReviewOpen(false);
    setReviewComment('');
    await load();
  };

  return <main className="history-wiki">
    <div className="history-standard-header">
      <PageHeader title="院史共编" description="校友可在此查阅、补充院史资料，提交内容经审核后发布。" extra={<div className="history-page-tools"><div className="history-global-search"><SearchOutlined /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} placeholder="搜索已发布词条" aria-label="搜索院史词条" /><kbd>Enter</kbd></div>{user?.role === 'alumni' ? <Button type="primary" icon={<EditOutlined />} onClick={() => setEditorOpen(true)}>参与编写</Button> : null}</div>} />
    </div>
    <header className="history-topbar">
      <button className="history-brand" type="button" onClick={() => navigate('/')}><img src={logoUrl} alt="山东大学政治学与公共管理学院" /><span aria-hidden="true" /><strong>院史共编</strong></button>
      <div className="history-global-search"><SearchOutlined /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} placeholder="搜索已发布词条" aria-label="搜索院史词条" /><kbd>Enter</kbd></div>
      <Space size={10}><Button className="history-icon-button" icon={<HomeOutlined />} onClick={() => navigate('/')} aria-label="返回校友平台" />{user?.role === 'alumni' ? <Button type="primary" icon={<EditOutlined />} onClick={() => setEditorOpen(true)}>参与编写</Button> : null}</Space>
    </header>
    <div className="history-statusbar"><span><CheckCircleFilled /> 校友可阅读</span><span><SafetyCertificateOutlined /> 校友实名编辑</span><span><ClockCircleOutlined /> 管理员逐条审核</span><em>{loading ? '正在加载…' : '图片和扫描件审核通过后才展示'}</em></div>
    <div className="history-shell">
      <aside className="history-sidebar"><div className="history-side-title"><span>院史目录</span><small>{entryCount} 个词条</small></div><nav>{entries.map((entry) => <button key={entry.id} type="button" className={activeEntry?.id === entry.id ? 'active' : ''} onClick={() => { setActiveEntry(entry); setWorkspace('article'); }}><span>{entry.title}</span><small>v{entry.current_version}</small></button>)}</nav><div className="history-contribute-card"><BookOutlined /><strong>共同留下真实院史</strong><p>每段记忆均须注明来源，每次修改均可追溯。</p>{user?.role === 'alumni' ? <Button block onClick={() => setEditorOpen(true)}>创建新词条</Button> : null}</div></aside>
      <section className="history-main"><div className="history-workspace-switch"><Segmented value={workspace} onChange={(value) => setWorkspace(value as Workspace)} options={[{ label: '词条阅读', value: 'article', icon: <FileTextOutlined /> }, ...(user?.role === 'alumni' ? [{ label: '我的投稿', value: 'contributions', icon: <DiffOutlined /> }] : []), ...(canReview ? [{ label: <Badge size="small" count={reviews.length} offset={[9, -2]}>领域待审</Badge>, value: 'review', icon: <InboxOutlined /> }] : [])]} /></div>
        {workspace === 'article' ? <Article entry={activeEntry} onEdit={() => setEditorOpen(true)} /> : null}
        {workspace === 'contributions' ? <ContributionList items={contributions} onOpenArticle={() => setWorkspace('article')} /> : null}
        {workspace === 'review' && canReview ? <ReviewList items={reviews} onOpen={(item) => { setSelectedReview(item); setReviewComment(''); setReviewOpen(true); }} /> : null}
      </section>
    </div>
    <Drawer className="history-editor-drawer" width={680} open={editorOpen} onClose={() => setEditorOpen(false)} title={<div className="history-drawer-title"><EditOutlined /><span><strong>编辑词条</strong><small>提交后进入审核，不会直接覆盖正式内容</small></span></div>} footer={<div className="history-editor-footer"><span><SafetyCertificateOutlined /> 资料来源和修改记录会随投稿保留</span><Space><Button onClick={() => setEditorOpen(false)}>取消</Button><Button type="primary" onClick={() => void submitContribution()}>提交审核</Button></Space></div>}>
      <Form form={form} layout="vertical" initialValues={{ title: activeEntry?.title, section_name: '词条正文', change_note: '补充院史资料' }}><div className="history-form-grid"><Form.Item label="词条标题" name="title" rules={[{ required: true, message: '请填写词条标题' }]}><Input /></Form.Item><Form.Item label="编辑章节" name="section_name"><Input placeholder="如：发展历程" /></Form.Item></div><Form.Item label="正文内容" name="content" rules={[{ required: true, message: '请填写修改内容' }]}><Input.TextArea rows={10} maxLength={20000} showCount placeholder="写下可核验的事实，并注明时间、地点、人物。" /></Form.Item><Form.Item label="资料来源" name="source_note" rules={[{ required: true, message: '请注明资料来源' }]}><Input.TextArea rows={3} maxLength={5000} placeholder="如：学院年鉴 2010，第 32 页；附件需另附来源和授权说明。" /></Form.Item><Form.Item label="修改说明" name="change_note"><Input maxLength={1000} placeholder="简要说明本次补充内容" /></Form.Item><div className="history-source-proof"><PictureOutlined /><span><strong>图片和扫描件</strong><small>支持 JPG、PNG、WebP、PDF；单文件不超过 10 MB，每次最多 6 个。附件上传会在提交投稿后单独完成，并要求填写来源与授权说明。</small></span></div></Form>
      <section className="history-attachment-panel">
        <div className="history-attachment-heading"><PictureOutlined /><span><strong>图片和扫描件</strong><small>可选。每个文件不超过 10 MB，每次投稿最多 6 个。</small></span></div>
        <label className="history-file-picker"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" multiple onChange={(event) => { selectAttachments(event.target.files); event.currentTarget.value = ''; }} /><span>选择图片或扫描件</span></label>
        {attachments.length ? <div className="history-selected-files">{attachments.map((file, index) => <div key={`${file.name}-${index}`}><span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small><Button type="link" danger size="small" onClick={() => setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}>移除</Button></div>)}</div> : null}
        {attachments.length ? <div className="history-attachment-details"><Input value={attachmentDescription} onChange={(event) => setAttachmentDescription(event.target.value)} maxLength={1000} placeholder="附件说明（可选，如：1998 年毕业合影）" /><Input.TextArea value={attachmentSourceNote} onChange={(event) => setAttachmentSourceNote(event.target.value)} rows={2} maxLength={5000} placeholder="附件来源（必填，如：本人保存的原始照片）" /><Input.TextArea value={attachmentRightsNote} onChange={(event) => setAttachmentRightsNote(event.target.value)} rows={2} maxLength={5000} placeholder="授权说明（必填，如：本人拥有图片版权，同意用于院史展示）" /><Checkbox checked={attachmentConsent} onChange={(event) => setAttachmentConsent(event.target.checked)}>我确认有权提交上述图片或扫描件，并同意平台审核后展示。</Checkbox></div> : null}
      </section>
    </Drawer>
    <Modal className="history-review-modal" open={reviewOpen} onCancel={() => setReviewOpen(false)} title="审核投稿" width={760} footer={<Space><Button danger onClick={() => void review('reject')}>驳回</Button><Button onClick={() => void review('return')}>退回补充</Button><Button type="primary" icon={<CheckCircleFilled />} onClick={() => void review('approve')}>审核通过并发布</Button></Space>}>
      {selectedReview ? <div className="history-review-detail"><div className="history-review-meta"><Tag color="orange">待审</Tag><span>投稿编号 #{selectedReview.id}</span><span>数据域 #{selectedReview.data_domain_id ?? '待补充'}</span></div><h3>{selectedReview.title}</h3><p>{selectedReview.change_note || '校友提交了词条内容补充。'}</p><div className="history-diff"><div><small>当前正式内容</small><p>{activeEntry?.content || '该词条尚无正式内容。'}</p></div><div><small>建议修改为</small><p>{selectedReview.content}</p></div></div><div className="history-source-proof"><PictureOutlined /><span><strong>资料来源</strong><small>{selectedReview.source_note}</small></span></div><Input.TextArea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={3} placeholder="退回或驳回时必须填写审核意见" /></div> : null}
    </Modal>
  </main>;
}

function Article({ entry, onEdit }: { entry: HistoryEntry | null; onEdit: () => void }) {
  return <article className="history-article"><div className="history-breadcrumb"><BookOutlined /> 院史共编 <span>/</span> 正式词条</div><div className="history-article-head"><div><Tag color="red">正式词条</Tag><h1>{entry?.title || '暂无已发布词条'}</h1><p>{entry?.summary || '校友可提交可核验的院史资料，审核通过后将在这里展示。'}</p></div><Button type="primary" icon={<EditOutlined />} onClick={onEdit}>编辑本词条</Button></div><div className="history-article-meta"><span><CheckCircleFilled /> 已审核版本</span><span>{entry ? `版本 ${entry.current_version}` : '等待首个版本'}</span><span>{entry ? `更新于 ${new Date(entry.updated_at).toLocaleDateString()}` : ''}</span></div><div className="history-article-layout"><div className="history-article-body"><section><h2>词条正文</h2><p>{entry?.content || '暂时没有内容。'}</p></section><section className="history-references"><h2>参考资料</h2><p>资料来源及附件将在审核通过后随正式版本展示。</p></section></div><aside className="history-toc"><strong>内容可信机制</strong><a href="#top">实名贡献</a><a href="#top">来源必填</a><a href="#top">逐条审核</a><a href="#top">版本可追溯</a></aside></div></article>;
}

function ContributionList({ items, onOpenArticle }: { items: HistoryContribution[]; onOpenArticle: () => void }) {
  return <section className="history-dashboard-view"><div className="history-view-heading"><div><span className="history-eyebrow">个人贡献中心</span><h1>我的投稿</h1><p>草稿、待审资料和审核意见仅对本人可见。</p></div></div><div className="history-stat-grid"><div><strong>{items.length}</strong><span>累计提交</span></div><div><strong>{items.filter((item) => item.status === 'approved').length}</strong><span>已通过</span></div><div><strong>{items.filter((item) => item.status === 'pending').length}</strong><span>审核中</span></div><div><strong>{items.filter((item) => item.status === 'draft').length}</strong><span>草稿</span></div></div><div className="history-contribution-list">{items.length ? items.map((item) => <div className="history-contribution-row" key={item.id}><div className={`history-doc-icon ${item.status === 'approved' ? 'approved' : item.status === 'pending' ? 'pending' : 'draft'}`}><FileTextOutlined /></div><div><Tag color={statusColor[item.status]}>{statusText[item.status]}</Tag><h3>{item.title}</h3><p>{item.review_comment || item.change_note || '等待审核'}</p></div><Button onClick={onOpenArticle}>查看词条</Button></div>) : <div className="history-empty-review"><FileTextOutlined /><h2>还没有投稿</h2><p>提交第一份可核验的院史资料吧。</p></div>}</div></section>;
}

function ReviewList({ items, onOpen }: { items: HistoryContribution[]; onOpen: (item: HistoryContribution) => void }) {
  return <section className="history-dashboard-view"><div className="history-view-heading"><div><span className="history-eyebrow">管理员工作台</span><h1>领域待审</h1><p>列表仅显示当前管理员获授权培养类别内的投稿。</p></div></div><div className="history-review-list">{items.length ? items.map((item) => <button type="button" key={item.id} onClick={() => onOpen(item)}><div className="history-review-list-icon"><DiffOutlined /></div><div><Space><Tag color="orange">待审</Tag><Tag>{item.section_name || '词条正文'}</Tag></Space><h3>{item.title}</h3><p>{item.change_note || '校友提交了内容补充。'}</p><small>投稿编号 #{item.id} · 数据域 #{item.data_domain_id ?? '待补充'}</small></div><span>进入审核</span></button>) : <div className="history-empty-review"><CheckCircleFilled /><h2>待审内容已清空</h2><p>所有已授权领域的投稿均已处理。</p></div>}</div></section>;
}
